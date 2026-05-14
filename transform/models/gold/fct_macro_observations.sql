{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year(observation_date)', 'series_id']
) }}

with observations as (

    select *
    from {{ ref('int_macro_yoy') }}

),

series as (

    select
        series_id,
        title,
        frequency,
        units,
        seasonal_adjustment
    from {{ ref('stg_fred__series') }}

),

joined as (

    select
        {{ dbt_utils.generate_surrogate_key(['o.series_id', 'o.observation_date']) }} as observation_key,
        o.series_id,
        s.title                                                         as series_title,
        s.frequency                                                     as series_frequency,
        s.units                                                         as series_units,
        s.seasonal_adjustment,
        o.observation_date,
        cast(year(o.observation_date) as integer)                       as observation_year,
        cast(quarter(o.observation_date) as integer)                    as observation_quarter,
        cast(month(o.observation_date) as integer)                      as observation_month,
        o.value,
        o.prior_value,
        o.prior_observation_date,
        o.yoy_prior_value,
        o.yoy_prior_date,
        o.mom_change_abs,
        o.mom_change_pct,
        o.yoy_change_abs,
        o.yoy_change_pct
    from observations o
    left join series s
        on o.series_id = s.series_id

)

select * from joined
