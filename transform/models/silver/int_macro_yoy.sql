{{ config(materialized='view') }}

-- Enriches FRED observations with month-over-month and year-over-year
-- deltas. Frequency-aware: MoM uses the prior 30-day observation, YoY
-- uses the prior ~365-day observation, with self-joins on series + date.

with obs as (

    select
        series_id,
        observation_date,
        value
    from {{ ref('stg_fred__observations') }}

),

with_mom as (

    select
        o.series_id,
        o.observation_date,
        o.value,
        lag(o.value) over (
            partition by o.series_id
            order by o.observation_date
        )                                                               as prior_value,
        lag(o.observation_date) over (
            partition by o.series_id
            order by o.observation_date
        )                                                               as prior_observation_date
    from obs o

),

with_yoy as (

    select
        cur.series_id,
        cur.observation_date,
        cur.value,
        cur.prior_value,
        cur.prior_observation_date,
        prior_yr.value                                                  as yoy_prior_value,
        prior_yr.observation_date                                       as yoy_prior_date
    from with_mom cur
    left join obs prior_yr
        on prior_yr.series_id = cur.series_id
        and prior_yr.observation_date = date_add('month', -12, cur.observation_date)

),

final as (

    select
        series_id,
        observation_date,
        value,
        prior_value,
        prior_observation_date,
        yoy_prior_value,
        yoy_prior_date,
        case
            when prior_value is not null and prior_value <> 0
                then (value - prior_value) / abs(prior_value)
        end                                                             as mom_change_pct,
        case
            when yoy_prior_value is not null and yoy_prior_value <> 0
                then (value - yoy_prior_value) / abs(yoy_prior_value)
        end                                                             as yoy_change_pct,
        value - prior_value                                             as mom_change_abs,
        value - yoy_prior_value                                         as yoy_change_abs
    from with_yoy

)

select * from final
