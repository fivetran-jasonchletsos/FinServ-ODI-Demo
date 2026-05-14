{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['bucket(8, cik)']
) }}

with companies as (

    select *
    from {{ ref('stg_sec__companies') }}

),

sic_to_sector as (

    select *
    from {{ ref('sic_to_sector') }}

),

latest_financials as (

    select
        cik,
        period_end_date,
        revenue,
        net_income,
        total_assets,
        stockholders_equity,
        gross_margin,
        operating_margin,
        net_margin,
        debt_to_equity,
        revenue_growth_period,
        net_income_growth_period,
        row_number() over (
            partition by cik
            order by period_end_date desc
        )                                                               as recency_rank
    from {{ ref('int_company_financials') }}
    where revenue is not null

),

most_recent_financials as (

    select *
    from latest_financials
    where recency_rank = 1

),

joined as (

    select
        c.cik,
        c.ticker,
        c.company_name,
        c.sic_code,
        c.sic_description,
        coalesce(s.sector, 'Unclassified')                              as sector,
        c.state_of_incorporation,
        c.fiscal_year_end,
        c.ein,
        c.exchange,
        f.period_end_date                                               as latest_period_end,
        f.revenue                                                       as latest_revenue,
        f.net_income                                                    as latest_net_income,
        f.total_assets                                                  as latest_total_assets,
        f.stockholders_equity                                           as latest_stockholders_equity,
        f.gross_margin                                                  as latest_gross_margin,
        f.operating_margin                                              as latest_operating_margin,
        f.net_margin                                                    as latest_net_margin,
        f.debt_to_equity                                                as latest_debt_to_equity,
        f.revenue_growth_period                                         as latest_revenue_growth,
        f.net_income_growth_period                                      as latest_net_income_growth,
        c.loaded_at                                                     as loaded_at
    from companies c
    left join sic_to_sector s
        on c.sic_code = s.sic_code
    left join most_recent_financials f
        on c.cik = f.cik

)

select * from joined
