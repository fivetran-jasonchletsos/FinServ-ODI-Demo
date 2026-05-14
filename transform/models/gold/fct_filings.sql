{{ config(
    materialized='table',
    table_type='iceberg',
    format='parquet',
    partitioned_by=['year(filing_date)', 'form_type']
) }}

with filings as (

    select *
    from {{ ref('stg_sec__filings') }}

),

companies as (

    select
        cik,
        ticker,
        company_name,
        sic_code
    from {{ ref('stg_sec__companies') }}

),

sic_to_sector as (

    select *
    from {{ ref('sic_to_sector') }}

),

joined as (

    select
        {{ dbt_utils.generate_surrogate_key(['f.accession_number']) }}  as filing_key,
        f.accession_number,
        f.cik,
        c.ticker,
        c.company_name,
        coalesce(s.sector, 'Unclassified')                              as sector,
        f.form_type,
        case
            when f.form_type like '10-K%' then 'annual_report'
            when f.form_type like '10-Q%' then 'quarterly_report'
            when f.form_type like '8-K%'  then 'current_event'
            when f.form_type like 'S-%'   then 'registration'
            when f.form_type like '424%'  then 'prospectus'
            when f.form_type in ('3', '4', '5') then 'insider_transaction'
            when f.form_type like 'SC 13%' then 'beneficial_ownership'
            when f.form_type = 'DEF 14A'  then 'proxy'
            else 'other'
        end                                                             as filing_category,
        f.filing_date,
        f.period_of_report,
        cast(year(f.filing_date) as integer)                            as filing_year,
        cast(quarter(f.filing_date) as integer)                         as filing_quarter,
        cast(month(f.filing_date) as integer)                           as filing_month,
        f.filing_url,
        f.primary_document,
        f.loaded_at
    from filings f
    left join companies c
        on f.cik = c.cik
    left join sic_to_sector s
        on c.sic_code = s.sic_code

)

select * from joined
