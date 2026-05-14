{{ config(materialized='view') }}

-- Pivot the long-form XBRL facts table into a wide one-row-per-period
-- view per company. Only the headline concepts are pulled forward — this
-- is the layer downstream gold models read for fundamentals.

with facts as (

    select *
    from {{ ref('stg_sec__xbrl_facts') }}
    where period_type = 'duration'
      and unit = 'USD'

),

filings as (

    select
        accession_number,
        form_type,
        filing_date
    from {{ ref('stg_sec__filings') }}

),

facts_with_form as (

    select
        f.cik,
        f.accession_number,
        fl.form_type,
        fl.filing_date,
        f.period_start,
        f.period_end,
        f.concept,
        f.value
    from facts f
    left join filings fl
        on f.accession_number = fl.accession_number

),

pivoted as (

    select
        cik,
        period_end                                                      as period_end_date,
        period_start                                                    as period_start_date,
        max(form_type)                                                  as source_form_type,
        max(filing_date)                                                as filing_date,
        max(case when concept = 'Revenues' then value end)              as revenue,
        max(case when concept = 'CostOfRevenue' then value end)         as cost_of_revenue,
        max(case when concept = 'GrossProfit' then value end)           as gross_profit,
        max(case when concept = 'OperatingIncomeLoss' then value end)   as operating_income,
        max(case when concept = 'NetIncomeLoss' then value end)         as net_income,
        max(case when concept = 'Assets' then value end)                as total_assets,
        max(case when concept = 'Liabilities' then value end)           as total_liabilities,
        max(case when concept = 'StockholdersEquity' then value end)    as stockholders_equity,
        max(case when concept = 'CashAndCashEquivalentsAtCarryingValue' then value end) as cash_and_equivalents,
        max(case when concept = 'LongTermDebt' then value end)          as long_term_debt
    from facts_with_form
    group by 1, 2, 3

),

with_ratios as (

    select
        cik,
        period_end_date,
        period_start_date,
        source_form_type,
        filing_date,
        revenue,
        cost_of_revenue,
        gross_profit,
        operating_income,
        net_income,
        total_assets,
        total_liabilities,
        stockholders_equity,
        cash_and_equivalents,
        long_term_debt,
        case
            when revenue is not null and revenue <> 0
                then gross_profit / revenue
        end                                                             as gross_margin,
        case
            when revenue is not null and revenue <> 0
                then operating_income / revenue
        end                                                             as operating_margin,
        case
            when revenue is not null and revenue <> 0
                then net_income / revenue
        end                                                             as net_margin,
        case
            when stockholders_equity is not null and stockholders_equity <> 0
                then total_liabilities / stockholders_equity
        end                                                             as debt_to_equity,
        lag(revenue) over (
            partition by cik
            order by period_end_date
        )                                                               as prior_period_revenue,
        lag(net_income) over (
            partition by cik
            order by period_end_date
        )                                                               as prior_period_net_income
    from pivoted

),

final as (

    select
        cik,
        period_end_date,
        period_start_date,
        source_form_type,
        filing_date,
        revenue,
        cost_of_revenue,
        gross_profit,
        operating_income,
        net_income,
        total_assets,
        total_liabilities,
        stockholders_equity,
        cash_and_equivalents,
        long_term_debt,
        gross_margin,
        operating_margin,
        net_margin,
        debt_to_equity,
        prior_period_revenue,
        prior_period_net_income,
        case
            when prior_period_revenue is not null and prior_period_revenue <> 0
                then (revenue - prior_period_revenue) / abs(prior_period_revenue)
        end                                                             as revenue_growth_period,
        case
            when prior_period_net_income is not null and prior_period_net_income <> 0
                then (net_income - prior_period_net_income) / abs(prior_period_net_income)
        end                                                             as net_income_growth_period
    from with_ratios

)

select * from final
