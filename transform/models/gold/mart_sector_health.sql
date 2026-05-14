{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['sector']
) }}

-- Roll-up across the three bronze sources to produce a single sector
-- "health score" with median financials, complaint volume, and
-- aggregate filing event volume in the trailing 90 days.

with companies as (

    select
        cik,
        sector,
        latest_revenue_growth,
        latest_net_margin,
        latest_debt_to_equity
    from {{ ref('dim_companies') }}
    where sector is not null

),

financial_rollup as (

    select
        sector,
        count(distinct cik)                                             as companies_in_sector,
        approx_percentile(latest_revenue_growth, 0.5)                   as median_revenue_growth,
        approx_percentile(latest_net_margin, 0.5)                       as median_net_margin,
        approx_percentile(latest_debt_to_equity, 0.5)                   as median_debt_to_equity,
        avg(case when latest_revenue_growth < 0 then 1.0 else 0.0 end)  as pct_companies_revenue_declining
    from companies
    group by 1

),

filings_recent as (

    select
        f.sector,
        count_if(f.form_type like '8-K%')                               as recent_8k_count,
        count_if(f.form_type like '10-K%' or f.form_type like '10-Q%')  as recent_financial_filings,
        count(*)                                                        as total_recent_filings
    from {{ ref('fct_filings') }} f
    where f.filing_date >= date_add('day', -90, current_date)
    group by 1

),

complaints_recent as (

    select
        c.sector,
        count(*)                                                        as recent_complaint_count,
        avg(case when c.timely_response then 1.0 else 0.0 end)          as recent_timely_response_rate,
        avg(case when c.consumer_disputed then 1.0 else 0.0 end)        as recent_dispute_rate
    from {{ ref('fct_complaints') }} c
    where c.date_received >= date_add('day', -90, current_date)
      and c.sector is not null
    group by 1

),

joined as (

    select
        coalesce(fr.sector, fl.sector, cr.sector)                       as sector,
        coalesce(fr.companies_in_sector, 0)                             as companies_in_sector,
        fr.median_revenue_growth,
        fr.median_net_margin,
        fr.median_debt_to_equity,
        fr.pct_companies_revenue_declining,
        coalesce(fl.recent_8k_count, 0)                                 as recent_8k_count,
        coalesce(fl.recent_financial_filings, 0)                        as recent_financial_filings,
        coalesce(fl.total_recent_filings, 0)                            as total_recent_filings,
        coalesce(cr.recent_complaint_count, 0)                          as recent_complaint_count,
        cr.recent_timely_response_rate,
        cr.recent_dispute_rate
    from financial_rollup fr
    full outer join filings_recent fl
        on fr.sector = fl.sector
    full outer join complaints_recent cr
        on coalesce(fr.sector, fl.sector) = cr.sector

),

scored as (

    select
        sector,
        companies_in_sector,
        median_revenue_growth,
        median_net_margin,
        median_debt_to_equity,
        pct_companies_revenue_declining,
        recent_8k_count,
        recent_financial_filings,
        total_recent_filings,
        recent_complaint_count,
        recent_timely_response_rate,
        recent_dispute_rate,
        -- Sector stress score 0-100, higher = more stressed.
        -- Equal-weight blend of the four normalized signals.
        cast(
            least(
                100,
                greatest(
                    0,
                    25 * coalesce(pct_companies_revenue_declining, 0)
                    + 25 * coalesce(
                        case
                            when companies_in_sector > 0
                                then recent_8k_count * 1.0 / companies_in_sector
                        end,
                        0
                    )
                    + 25 * coalesce(
                        case
                            when companies_in_sector > 0
                                then recent_complaint_count * 1.0 / (companies_in_sector * 50.0)
                        end,
                        0
                    )
                    + 25 * coalesce(
                        case
                            when median_net_margin is null then 0
                            when median_net_margin < 0    then 1.0
                            when median_net_margin > 0.20 then 0.0
                            else (0.20 - median_net_margin) / 0.20
                        end,
                        0
                    )
                )
            )
        as double)                                                      as sector_stress_score,
        current_timestamp                                               as built_at
    from joined

)

select * from scored
