// Elenco delle indagini proposte nel menu a discesa di "Nuova attività".
// Per aggiungere, togliere o rinominare una voce basta modificare questo elenco.
export const INDAGINI = [
  { gruppo: 'Neuroimaging', voci: [
    'TC encefalo', 'TC encefalo di controllo a 24h', 'Angio-TC TSA e circolo intracranico', 'TC perfusione',
    'RM encefalo', 'RM encefalo con mdc', 'RM encefalo con sequenze SWI', 'RM encefalo con DWI/ADC',
    'Angio-RM encefalo', 'RM rachide cervicale', 'RM rachide dorso-lombare', 'RM midollo',
    'PET-FDG cerebrale', 'PET amiloide', 'DaTSCAN',
  ] },
  { gruppo: 'Neurosonologia', voci: [
    'Ecocolordoppler TSA', 'Ecocolordoppler transcranico', 'Doppler transcranico con test delle bolle',
    'Ecografia del nervo ottico (ONSD)', 'Ecocolordoppler arterie temporali superficiali',
  ] },
  { gruppo: 'Neurofisiologia', voci: [
    'EEG', 'EEG con deprivazione di sonno', 'EEG prolungato / video-EEG', 'Potenziali evocati',
    'Elettromiografia (EMG-ENG)', 'Stimolazione ripetitiva',
  ] },
  { gruppo: 'Cardiologia', voci: [
    'ECG', 'Ecocardiogramma transtoracico', 'Ecocardiogramma transesofageo',
    'Monitoraggio ECG continuo', 'Holter ECG', 'Holter pressorio',
  ] },
  { gruppo: 'Laboratorio', voci: [
    'Esami ematici di ingresso', 'Emocromo', 'Funzionalità renale ed elettroliti', 'Funzionalità epatica',
    'Coagulazione', 'Glicemia', 'HbA1c', 'Profilo lipidico', 'TSH', 'Vitamina B12 e folati',
    'VES e PCR', 'Emogasanalisi', 'Esame urine',
  ] },
  { gruppo: 'Liquor', voci: [
    'Rachicentesi', 'Esame chimico-fisico del liquor', 'Biomarcatori liquorali (Aβ42, tau, p-tau)',
    'Bande oligoclonali', 'Ricerca anticorpi anti-neurone',
  ] },
  { gruppo: 'Valutazioni', voci: [
    'Valutazione neuropsicologica', 'MMSE / MoCA', 'Valutazione logopedica', 'Valutazione fisiatrica',
    'Screening disfagia', 'Valutazione cardiologica', 'Valutazione neurochirurgica', 'Valutazione oculistica',
    'Valutazione otorinolaringoiatrica', 'Consulenza infettivologica', 'Consulenza internistica',
  ] },
  { gruppo: 'Altro', voci: [
    'Radiografia torace', 'Ecografia addome', 'Polisonnografia', 'Biopsia', 'Test genetico',
  ] },
]
