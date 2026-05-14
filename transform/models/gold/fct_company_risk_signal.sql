{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['bucket(8, cik)']
) }}

-- Cross-source risk signal: the headline model that shows why this
-- demo is interesting. Blends four signals each scaled to 0-25:
--
--   1. financial deterioration  — from int_company_financials
--   2. complaint velocity       — from fct_complaints (last 90 days)
--   3. 8-K event volume         — from fct_filings (last 90 days)
--   4. sector macro stress      — from mart_sector_health
--
-- Output: one row per CIK with risk_score (0-100), risk_bucket, and
-- the four component scores so the demo UI can show the decomposition.

with companies as (

    select
        cik,
        ticker,
        company_name,
        sector,
        latest_revenue_growth,
        latest_net_margin,
        latest_debt_to_equity
    from {{ ref('dim_companies') }}

),

financial_signal as (

    select
        cik,
        -- 25 points: revenue declining + margin compression + leverage.
        cast(
            least(
                25.0,
                greatest(
                    0.0,
                    -- Up to 12 points for revenue contraction
                    12.0 * coalesce(
                        case
                            when latest_revenue_growth is null then 0
                            when latest_revenue_growth < -0.25 then 1.0
                            when latest_revenue_growth > 0.10 then 0.0
                            else (0.10 - latest_revenue_growth) / 0.35
                        end,
                        0
                    )
                    -- Up to 8 points for negative / compressed margin
                    + 8.0 * coalesce(
                        case
                            when latest_net_margin is null then 0
                            when latest_net_margin < -0.10 then 1.0
                            when latest_net_margin > 0.15 then 0.0
                            else (0.15 - latest_net_margin) / 0.25
                        end,
                        0
                    )
                    -- Up to 5 points for excessive leverage
                    + 5.0 * coalesce(
                        case
                            when latest_debt_to_equity is null then 0
                            when latest_debt_to_equity > 5.0 then 1.0
                            when latest_debt_to_equity < 1.0 then 0.0
                            else (latest_debt_to_equity - 1.0) / 4.0
                        end,
                        0
                    )
                )
            )
        as double)                                                      as financial_score
    from companies

),

filings_recent as (

    select
        cik,
        count_if(form_type like '8-K%')                                 as recent_8k_count
    from {{ ref('fct_filings') }}
    where filing_date >= date_add('day', -90, current_date)
    group by 1

),

filing_signal as (

    select
        c.cik,
        coalesce(f.recent_8k_count, 0)                                  as recent_8k_count,
        -- 25 points: scaled by 8-K filing volume in the last 90 days.
        -- 0 filings -> 0, 1 -> ~8, 3 -> ~20, 5+ -> 25.
        cast(
            least(
                25.0,
                coalesce(f.recent_8k_count, 0) * 5.0
            )
        as double)                                                      as filing_score
    from companies c
    left join filings_recent f
        on c.cik = f.cik

),

complaints_recent as (

    select
        cik,
        count(*)                                                        as recent_complaint_count
    from {{ ref('fct_complaints') }}
    where date_received >= date_add('day', -90, current_date)
      and cik is not null
    group by 1

),

complaint_stats as (

    select
        approx_percentile(recent_complaint_count, 0.95)                 as p95_complaints,
        approx_percentile(recent_complaint_count, 0.50)                 as p50_complaints
    from complaints_recent

),

complaint_signal as (

    select
        c.cik,
        coalesce(cr.recent_complaint_count, 0)                          as recent_complaint_count,
        -- 25 points: scaled to the sector population p95 (cap at 25).
        cast(
            least(
                25.0,
                greatest(
                    0.0,
                    case
                        when cs.p95_complaints is null or cs.p95_complaints = 0
                            then 0.0
                        else coalesce(cr.recent_complaint_count, 0) * 25.0 / cs.p95_complaints
                    end
                )
            )
        as double)                                                      as complaint_score
    from companies c
    left join complaints_recent cr
        on c.cik = cr.cik
    cross join complaint_stats cs

),

sector_signal as (

    select
        c.cik,
        c.sector,
        coalesce(s.sector_stress_score, 0)                              as sector_stress_score,
        -- 25 points: a quarter of the sector stress score.
        cast(coalesce(s.sector_stress_score, 0) * 0.25 as double)       as sector_score
    from companies c
    left join {{ ref('mart_sector_health') }} s
        on c.sector = s.sector

),

assembled as (

    select
        c.cik,
        c.ticker,
        c.company_name,
        c.sector,
        fs.financial_score,
        fl.filing_score,
        fl.recent_8k_count,
        cs.complaint_score,
        cs.recent_complaint_count,
        ss.sector_score,
        ss.sector_stress_score,
        fs.financial_score
            + fl.filing_score
            + cs.complaint_score
            + ss.sector_score                                           as risk_score
    from companies c
    left join financial_signal fs
        on c.cik = fs.cik
    left join filing_signal fl
        on c.cik = fl.cik
    left join complaint_signal cs
        on c.cik = cs.cik
    left join sector_signal ss
        on c.cik = ss.cik

),

bucketed as (

    select
        cik,
        ticker,
        company_name,
        sector,
        cast(risk_score as double)                                      as risk_score,
        case
            when risk_score < 25  then 'low'
            when risk_score < 50  then 'moderate'
            when risk_score < 75  then 'elevated'
            else 'high'
        end                                                             as risk_bucket,
        financial_score,
        filing_score,
        complaint_score,
        sector_score,
        recent_8k_count,
        recent_complaint_count,
        sector_stress_score,
        current_timestamp                                               as built_at
    from assembled

)

select * from bucketed
