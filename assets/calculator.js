/* calculator.js — takehomewage.com
 * Tools: "takeHome" (minimum-wage or any hourly pay → take-home after Income Tax, NI and pension) and
 *        "nmwRates" (rate lookup by age band).
 * Tax year 2026/27, England / Wales / Northern Ireland. Scotland has different income tax bands — not
 * supported in v1 (the page says so; a Scottish-bands version is a v2 task).
 *
 * FIGURE STATUS: all figures verified on gov.uk 2026-09-19.
 *   NMW from 1 April 2026 (gov.uk/national-minimum-wage-rates): 21+ £12.71 · 18–20 £10.85 ·
 *     under 18 £8.00 · apprentice £8.00.
 *   Income Tax 2026/27 (gov.uk/income-tax-rates): personal allowance £12,570 · basic rate 20% to
 *     £50,270 · higher rate 40% to £125,140 · additional rate 45% above £125,140 · allowance
 *     reduced by £1 for every £2 of income above £100,000.
 *   Employee NI 2026/27 (gov.uk/national-insurance-rates-letters, category A): 8% between £242 and
 *     £967 a week (£12,570 and £50,270 a year), 2% above £967 a week.
 *   Auto-enrolment (gov.uk/workplace-pensions): minimum 8% total, employer at least 3%, on
 *     qualifying earnings of £6,240–£50,270; enrolment trigger £10,000 a year.
 *   Rates change every 6 April (minimum wage 1 April): re-check each year.
 */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C; else root.CALCS = C;
})(typeof self !== 'undefined' ? self : this, function () {
  const RULES = {
    taxYear: '2026/27',
    nmw: { '21': 12.71, '18': 10.85, '16': 8.00, apprentice: 8.00 },          // VERIFIED gov.uk (from 1 April 2026)
    personalAllowance: 12570, basicLimit: 50270, additionalThreshold: 125140,  // VERIFIED gov.uk
    rates: { basic: 0.20, higher: 0.40, additional: 0.45 },                  // VERIFIED gov.uk 2026-09-19
    taperStart: 100000,                                                       // VERIFIED gov.uk (£1 lost per £2 over)
    ni: { pt: 12570, uel: 50270, main: 0.08, upper: 0.02 },                  // VERIFIED gov.uk (£242/£967 a week)
    pensionQE: { lower: 6240, upper: 50270 },                                 // VERIFIED gov.uk 2026-09-19
  };
  const r2 = n => Math.round(n * 100) / 100;

  function incomeTax(taxable) {
    const pa = Math.max(0, RULES.personalAllowance - Math.max(0, taxable - RULES.taperStart) / 2);
    const above = Math.max(0, taxable - pa);
    const basicBand = RULES.basicLimit - RULES.personalAllowance;              // 37,700
    const basic = Math.min(above, basicBand);
    const higher = Math.min(Math.max(0, above - basicBand), Math.max(0, RULES.additionalThreshold - pa - basicBand));
    const additional = Math.max(0, taxable - RULES.additionalThreshold);
    return basic * RULES.rates.basic + higher * RULES.rates.higher + additional * RULES.rates.additional;
  }
  const nationalInsurance = gross => Math.max(0, Math.min(gross, RULES.ni.uel) - RULES.ni.pt) * RULES.ni.main + Math.max(0, gross - RULES.ni.uel) * RULES.ni.upper;

  const bandOptions = [
    { value: '21', label: '21 or over (National Living Wage)' }, { value: '18', label: '18 to 20' },
    { value: '16', label: 'Under 18' }, { value: 'apprentice', label: 'Apprentice (under 19, or in first year)' }];

  const takeHome = {
    title: 'Minimum wage take-home pay calculator',
    currency: { code: 'GBP', locale: 'en-GB' },
    inputs: [
      { id: 'band', label: 'Your age band', type: 'select', default: '21', options: bandOptions },
      { id: 'useNmw', label: 'I’m paid the minimum wage for my age', type: 'checkbox', default: true },
      { id: 'hourly', label: 'My hourly rate', type: 'number', prefix: '£', default: 13.5, min: 0, showIf: s => !s.useNmw },
      { id: 'hours', label: 'Hours per week', type: 'number', default: 37.5, min: 0, max: 100 },
      { id: 'weeks', label: 'Paid weeks per year', type: 'number', default: 52, min: 1, max: 53 },
      { id: 'pension', label: 'I’m in a workplace pension (auto-enrolment)', type: 'checkbox', default: false },
      { id: 'pensionPct', label: 'My pension contribution', type: 'number', suffix: '%', default: 5, min: 0, max: 100, showIf: s => s.pension, help: 'Worked out on qualifying earnings, as most auto-enrolment schemes do.' },
      { id: 'scotland', label: 'I live in Scotland', type: 'checkbox', default: false },
    ],
    compute(v, fmt) {
      const w = [];
      const nmw = RULES.nmw[v.band] ?? RULES.nmw['21'];
      const hourly = v.useNmw ? nmw : (v.hourly || 0);
      if (!v.useNmw && hourly < nmw) w.push(`£${hourly.toFixed(2)} is below the ${fmt.money(nmw)} minimum for this age band.`);
      if (v.scotland) w.push('Scottish income tax bands are different and are not supported yet; the income tax figure below uses England, Wales and Northern Ireland bands.');
      const gross = hourly * (v.hours || 0) * (v.weeks || 52);
      const pension = v.pension ? Math.max(0, Math.min(gross, RULES.pensionQE.upper) - RULES.pensionQE.lower) * (v.pensionPct || 0) / 100 : 0;
      const tax = incomeTax(gross - pension);                      // net pay arrangement: pension before tax
      const ni = nationalInsurance(gross);                         // NI on full gross
      const net = gross - pension - tax - ni;
      return {
        raw: { hourly, gross: r2(gross), pension: r2(pension), tax: r2(tax), ni: r2(ni), net: r2(net) },
        warnings: w,
        summary: [
          { label: 'Take-home per month', value: fmt.money(net / 12), strong: true },
          { label: 'Take-home per week', value: fmt.money(net / (v.weeks || 52)) },
          { label: 'Take-home per year', value: fmt.money(net) },
        ],
        rows: [
          { label: `Gross pay (${fmt.money(hourly)}/h × ${v.hours} h × ${v.weeks} weeks)`, value: fmt.money(gross) },
          ...(pension ? [{ label: 'Pension', value: `− ${fmt.money(pension)}` }] : []),
          { label: 'Income Tax', value: `− ${fmt.money(tax)}` },
          { label: 'National Insurance', value: `− ${fmt.money(ni)}` },
          { label: 'Take-home pay', value: fmt.money(net), total: true },
        ],
        notes: [`Tax year ${RULES.taxYear}, tax code 1257L, annual figures. Student loan and other deductions are not included. Your payslip may differ slightly because tax and NI are worked out each pay period.`],
      };
    },
  };

  const nmwRates = {
    title: 'National Minimum Wage rates',
    currency: { code: 'GBP', locale: 'en-GB' },
    inputs: [
      { id: 'band', label: 'Age band', type: 'select', default: '21', options: bandOptions },
      { id: 'hours', label: 'Hours per week', type: 'number', default: 40, min: 0 },
    ],
    compute(v, fmt) {
      const rate = RULES.nmw[v.band] ?? RULES.nmw['21'];
      return {
        raw: { rate, weekly: r2(rate * (v.hours || 0)), yearly: r2(rate * (v.hours || 0) * 52) },
        summary: [
          { label: 'Minimum hourly rate from April 2026', value: fmt.money(rate), strong: true },
          { label: 'Weekly gross', value: fmt.money(rate * (v.hours || 0)) },
          { label: 'Yearly gross (52 weeks)', value: fmt.money(rate * (v.hours || 0) * 52) },
        ],
      };
    },
  };

  return {
    takeHome, nmwRates,
    __rules: RULES,
    __tests: [
      { calc: 'takeHome', name: '21+, NMW, 37.5 h × 52, no pension',
        // gross 12.71 × 37.5 × 52 = 24,784.50 · tax (24,784.50 − 12,570) × 20% = 2,442.90 · NI × 8% = 977.16 · net 21,364.44
        input: { band: '21', useNmw: true, hours: 37.5, weeks: 52, pension: false, scotland: false }, expect: { gross: 24784.5, tax: 2442.9, ni: 977.16, net: 21364.44 } },
      { calc: 'takeHome', name: 'same with 5% pension on qualifying earnings',
        // pension (24,784.50 − 6,240) × 5% = 927.225 · tax (24,784.50 − 927.225 − 12,570) × 20% = 2,257.455 · net 20,622.66
        input: { band: '21', useNmw: true, hours: 37.5, weeks: 52, pension: true, pensionPct: 5, scotland: false }, expect: { pension: 927.23, tax: 2257.46, net: 20622.66 } },
      { calc: 'takeHome', name: '18–20 rate £10.85, 20 h', input: { band: '18', useNmw: true, hours: 20, weeks: 52, pension: false }, expect: { gross: 11284, tax: 0, ni: 0, net: 11284 } },
      { calc: 'takeHome', name: 'higher rate: £60,000',
        // tax 37,700 × 20% + (60,000 − 50,270) × 40% = 7,540 + 3,892 = 11,432 · NI 37,700 × 8% + 9,730 × 2% = 3,016 + 194.60 = 3,210.60
        input: { band: '21', useNmw: false, hourly: 60000 / 2080, hours: 40, weeks: 52, pension: false }, expect: { gross: 60000, tax: 11432, ni: 3210.6 } },
      { calc: 'takeHome', name: 'allowance taper: £110,000',
        // PA 12,570 − 5,000 = 7,570 · above 102,430 · basic 37,700 × 20% = 7,540 · higher 64,730 × 40% = 25,892 → 33,432
        input: { band: '21', useNmw: false, hourly: 110000 / 2080, hours: 40, weeks: 52, pension: false }, expect: { tax: 33432 } },
      { calc: 'nmwRates', name: 'under 18 £8.00 × 40', input: { band: '16', hours: 40 }, expect: { rate: 8, weekly: 320 } },
    ],
  };
});
