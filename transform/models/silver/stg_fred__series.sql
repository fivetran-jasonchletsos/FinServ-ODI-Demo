{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_fred', 'series') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        upper(trim(series_id))                          as series_id,
        trim(title)                                     as title,
        trim(frequency)                                 as frequency,
        trim(units)                                     as units,
        trim(seasonal_adjustment)                       as seasonal_adjustment,
        cast(last_updated as timestamp)                 as last_updated,
        trim(notes)                                     as notes,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
