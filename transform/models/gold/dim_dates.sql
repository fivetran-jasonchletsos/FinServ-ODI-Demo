{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year']
) }}

-- Standard date spine covering 2000-01-01 through 2035-12-31.
-- Generated with a sequence-of-days CTE so it works on Athena/Trino.

with date_spine as (

    select
        cast(date_add('day', seq, date '2000-01-01') as date)           as date_day
    from unnest(sequence(0, 13148)) as t(seq)

),

enriched as (

    select
        date_day,
        cast(year(date_day) as integer)                                 as year,
        cast(quarter(date_day) as integer)                              as quarter,
        cast(month(date_day) as integer)                                as month,
        cast(day(date_day) as integer)                                  as day_of_month,
        cast(day_of_week(date_day) as integer)                          as day_of_week,
        cast(day_of_year(date_day) as integer)                          as day_of_year,
        cast(week(date_day) as integer)                                 as iso_week,
        format_datetime(date_day, 'MMMM')                               as month_name,
        format_datetime(date_day, 'EEEE')                               as day_name,
        case
            when day_of_week(date_day) in (6, 7) then false
            else true
        end                                                             as is_weekday,
        cast(format_datetime(date_day, 'yyyyMM') as integer)            as year_month_key,
        cast(format_datetime(date_day, 'yyyy') as integer) * 10
            + cast(quarter(date_day) as integer)                        as year_quarter_key
    from date_spine

)

select * from enriched
