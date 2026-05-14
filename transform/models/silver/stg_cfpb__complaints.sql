{{ config(materialized='view') }}

with source as (

    select *
    from {{ source('bronze_cfpb', 'complaints') }}
    where coalesce(_fivetran_deleted, false) = false

),

renamed as (

    select
        cast(complaint_id as varchar)                   as complaint_id,
        cast(date_received as date)                     as date_received,
        trim(product)                                   as product,
        trim(sub_product)                               as sub_product,
        trim(issue)                                     as issue,
        trim(sub_issue)                                 as sub_issue,
        upper(trim(company_name))                       as company_name_raw,
        regexp_replace(
            upper(trim(company_name)),
            '\\s+(INC|CORP|CORPORATION|LLC|LTD|N\\.A\\.|NA|HOLDINGS|GROUP|COMPANY|CO|PLC|SA)\\.?$',
            ''
        )                                               as company_name_normalized,
        upper(trim(state))                              as state,
        trim(zip_code)                                  as zip_code,
        trim(consumer_consent_provided)                 as consumer_consent_provided,
        trim(submitted_via)                             as submitted_via,
        cast(date_sent_to_company as date)              as date_sent_to_company,
        trim(company_response)                          as company_response,
        case
            when lower(trim(timely_response)) = 'yes' then true
            when lower(trim(timely_response)) = 'no' then false
            else null
        end                                             as timely_response,
        case
            when lower(trim(consumer_disputed)) = 'yes' then true
            when lower(trim(consumer_disputed)) = 'no' then false
            else null
        end                                             as consumer_disputed,
        _fivetran_synced                                as loaded_at
    from source

)

select * from renamed
