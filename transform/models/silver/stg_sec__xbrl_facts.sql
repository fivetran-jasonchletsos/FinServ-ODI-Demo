{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_sec_edgar', 'xbrl_facts') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        cast(fact_id as varchar)                        as fact_id,
        trim(accession_number)                          as accession_number,
        lpad(cast(cik as varchar), 10, '0')             as cik,
        trim(concept)                                   as concept,
        cast(period_start as date)                      as period_start,
        cast(period_end as date)                        as period_end,
        lower(trim(period_type))                        as period_type,
        cast(value as double)                           as value,
        upper(trim(unit))                               as unit,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
