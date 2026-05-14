{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year(date_received)', 'topic_cluster']
) }}

-- The headline silver-to-gold value-add: bucket the ~95 raw CFPB
-- (issue, sub_issue) combinations into ~10 analyst-friendly topic
-- clusters that downstream marts and the semantic layer key off of.

with complaints as (

    select *
    from {{ ref('stg_cfpb__complaints') }}

),

xref as (

    select
        company_name_raw,
        cik,
        sec_company_name,
        match_method,
        match_confidence
    from {{ ref('int_complaint_company_xref') }}

),

companies as (

    select
        cik,
        ticker,
        sic_code
    from {{ ref('stg_sec__companies') }}

),

sic_to_sector as (

    select *
    from {{ ref('sic_to_sector') }}

),

clustered as (

    select
        c.complaint_id,
        c.date_received,
        c.product,
        c.sub_product,
        c.issue,
        c.sub_issue,
        c.company_name_raw                                              as company_name,
        c.state,
        c.zip_code,
        c.consumer_consent_provided,
        c.submitted_via,
        c.date_sent_to_company,
        c.company_response,
        c.timely_response,
        c.consumer_disputed,
        case
            when lower(coalesce(c.product, '')) like '%credit report%'
                or lower(coalesce(c.issue, '')) like '%credit report%'
                then 'credit_reporting'
            when lower(coalesce(c.product, '')) like '%debt collect%'
                or lower(coalesce(c.issue, '')) like '%debt collect%'
                then 'debt_collection'
            when lower(coalesce(c.product, '')) like '%mortgage%'
                or lower(coalesce(c.issue, '')) like '%mortgage%'
                or lower(coalesce(c.sub_issue, '')) like '%loan servicing%'
                then 'mortgage_servicing'
            when lower(coalesce(c.product, '')) like '%student loan%'
                then 'student_loan'
            when lower(coalesce(c.product, '')) like '%vehicle loan%'
                or lower(coalesce(c.product, '')) like '%auto loan%'
                then 'auto_loan'
            when lower(coalesce(c.product, '')) like '%credit card%'
                then 'credit_card'
            when lower(coalesce(c.product, '')) like '%checking%'
                or lower(coalesce(c.product, '')) like '%savings%'
                or lower(coalesce(c.product, '')) like '%bank account%'
                then 'deposit_account'
            when lower(coalesce(c.product, '')) like '%money transfer%'
                or lower(coalesce(c.product, '')) like '%virtual currency%'
                then 'payments_transfers'
            when lower(coalesce(c.product, '')) like '%payday%'
                or lower(coalesce(c.product, '')) like '%personal loan%'
                then 'consumer_lending'
            when lower(coalesce(c.issue, '')) like '%fraud%'
                or lower(coalesce(c.issue, '')) like '%unauthorized%'
                or lower(coalesce(c.issue, '')) like '%identity theft%'
                then 'fraud_and_identity'
            else 'other'
        end                                                             as topic_cluster,
        c.loaded_at
    from complaints c

),

joined as (

    select
        {{ dbt_utils.generate_surrogate_key(['cl.complaint_id']) }}     as complaint_key,
        cl.complaint_id,
        cl.date_received,
        cl.product,
        cl.sub_product,
        cl.issue,
        cl.sub_issue,
        cl.topic_cluster,
        cl.company_name,
        x.cik,
        co.ticker,
        coalesce(s.sector, 'Unclassified')                              as sector,
        x.match_method                                                  as company_match_method,
        x.match_confidence                                              as company_match_confidence,
        cl.state,
        cl.zip_code,
        cl.consumer_consent_provided,
        cl.submitted_via,
        cl.date_sent_to_company,
        cl.company_response,
        cl.timely_response,
        cl.consumer_disputed,
        cl.loaded_at
    from clustered cl
    left join xref x
        on cl.company_name = x.company_name_raw
    left join companies co
        on x.cik = co.cik
    left join sic_to_sector s
        on co.sic_code = s.sic_code

)

select * from joined
