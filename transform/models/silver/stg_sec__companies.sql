{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_sec_edgar', 'companies') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        lpad(cast(cik as varchar), 10, '0')             as cik,
        upper(trim(ticker))                             as ticker,
        trim(company_name)                              as company_name,
        cast(sic_code as varchar)                       as sic_code,
        trim(sic_description)                           as sic_description,
        upper(trim(state_of_incorporation))             as state_of_incorporation,
        trim(fiscal_year_end)                           as fiscal_year_end,
        trim(ein)                                       as ein,
        upper(trim(exchange))                           as exchange,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
