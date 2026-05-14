{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_sec_edgar', 'filings') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        trim(accession_number)                          as accession_number,
        lpad(cast(cik as varchar), 10, '0')             as cik,
        upper(trim(form_type))                          as form_type,
        cast(filing_date as date)                       as filing_date,
        cast(period_of_report as date)                  as period_of_report,
        trim(filing_url)                                as filing_url,
        trim(primary_document)                          as primary_document,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
