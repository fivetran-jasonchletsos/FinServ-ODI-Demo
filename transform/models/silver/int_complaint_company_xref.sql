{{ config(materialized='view') }}

-- Bridges CFPB free-text "company_name" strings to SEC CIKs.
-- The match is intentionally lightweight (normalized exact + prefix +
-- token-containment) so it runs cheaply in Athena and is deterministic.
-- Higher-precision matching is left to a downstream entity-resolution step.

with cfpb as (

    select distinct
        company_name_raw,
        company_name_normalized
    from {{ ref('stg_cfpb__complaints') }}
    where company_name_normalized is not null
      and length(company_name_normalized) >= 3

),

sec as (

    select
        cik,
        company_name,
        regexp_replace(
            upper(trim(company_name)),
            '\\s+(INC|CORP|CORPORATION|LLC|LTD|N\\.A\\.|NA|HOLDINGS|GROUP|COMPANY|CO|PLC|SA)\\.?$',
            ''
        )                                                               as company_name_normalized
    from {{ ref('stg_sec__companies') }}

),

exact_match as (

    select
        c.company_name_raw,
        c.company_name_normalized                                       as cfpb_normalized,
        s.cik,
        s.company_name                                                  as sec_company_name,
        'exact_normalized'                                              as match_method,
        1.00                                                            as match_confidence
    from cfpb c
    inner join sec s
        on c.company_name_normalized = s.company_name_normalized

),

unmatched as (

    select c.*
    from cfpb c
    left join exact_match e
        on c.company_name_raw = e.company_name_raw
    where e.company_name_raw is null

),

prefix_match as (

    select
        u.company_name_raw,
        u.company_name_normalized                                       as cfpb_normalized,
        s.cik,
        s.company_name                                                  as sec_company_name,
        'prefix_token'                                                  as match_method,
        0.70                                                            as match_confidence
    from unmatched u
    inner join sec s
        on s.company_name_normalized like u.company_name_normalized || '%'
        or u.company_name_normalized like s.company_name_normalized || '%'

),

combined as (

    select * from exact_match
    union all
    select * from prefix_match

),

ranked as (

    select
        company_name_raw,
        cfpb_normalized,
        cik,
        sec_company_name,
        match_method,
        match_confidence,
        row_number() over (
            partition by company_name_raw
            order by match_confidence desc, sec_company_name asc
        )                                                               as match_rank
    from combined

)

select
    company_name_raw,
    cfpb_normalized,
    cik,
    sec_company_name,
    match_method,
    match_confidence
from ranked
where match_rank = 1
