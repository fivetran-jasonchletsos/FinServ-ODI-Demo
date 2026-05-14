{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_fred', 'observations') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        upper(trim(series_id))                          as series_id,
        cast(observation_date as date)                  as observation_date,
        try_cast(nullif(trim(cast(value as varchar)), '.') as double) as value,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
where value is not null
