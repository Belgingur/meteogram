export interface Labels {
  nextHours: (h: number) => string;
  swipe: string;
  legTemp: string;
  legPrecip: string;
  legPmax: string;
  legWind: string;
  legGust: string;
  laneTemp: string;
  lanePrecip: string;
  laneWind: string;
  loading: string;
  error: string;
  retry: string;
  close: string;
  weekdays: string[];
  months: string[];
  /** 8-point compass labels, N first, clockwise */
  compass: string[];
  dayLabel: (weekday: string, day: number, month: string) => string;
  dateLabel: (day: number, month: string) => string;
  // Landing (full mode)
  now: string;
  feels: string;
  precip: string;
  wind: string;
  table: string;
  graph: string;
  today: string;
  tomorrow: string;
  timeCol: string;
  tempCol: string;
  settings: string;
  forecastModel: string;
  language: string;
  location: string;
  search: string;
  /** Map panel 2a */
  analysis: string;
  lastUpdate: string;
  next48: string;
  axTemp: string;
  axWind: string;
  fullscreen: string;
  exitFullscreen: string;
  /** aria-label for the landscape time-scrubber slider */
  scrubSlider: string;
  /** aria-labels for the landscape scrub-readout popup controls */
  minimize: string;
  expand: string;
  /** Resize-grip affordance label (aria-label + native tooltip). */
  resize: string;
  monthsShort: string[];
  metaLine: (analysis: string, lastUpdate: string) => string;
}

const is: Labels = {
  nextHours: (h) => `Næstu ${h} klst.`,
  swipe: "strjúktu til hliðar →",
  legTemp: "Hiti (°C)",
  legPrecip: "Úrkoma (mm)",
  legPmax: "Hámarksúrkoma (mm)",
  legWind: "Vindur (m/s)",
  legGust: "Vindhviða (m/s)",
  laneTemp: "Hiti",
  lanePrecip: "Úrkoma",
  laneWind: "Vindur",
  loading: "Sæki spá…",
  error: "Ekki tókst að sækja spá",
  retry: "Reyna aftur",
  close: "Loka",
  weekdays: ["sun.", "mán.", "þri.", "mið.", "fim.", "fös.", "lau."],
  months: [
    "janúar", "febrúar", "mars", "apríl", "maí", "júní",
    "júlí", "ágúst", "september", "október", "nóvember", "desember",
  ],
  compass: ["N", "NA", "A", "SA", "S", "SV", "V", "NV"],
  dayLabel: (wd, day, month) => `${wd} ${day}. ${month}`,
  dateLabel: (day, month) => `${day}. ${month}`,
  now: "Veðrið núna",
  feels: "Líðan",
  precip: "Úrkoma",
  wind: "Vindur",
  table: "Tafla",
  graph: "Graf",
  today: "Í dag",
  tomorrow: "Á morgun",
  timeCol: "Kl.",
  tempCol: "Hiti",
  settings: "Stillingar",
  forecastModel: "Spálíkan",
  language: "Tungumál",
  location: "Staðsetning",
  search: "Leita að stað eða veðurstöð…",
  analysis: "Greiningartími",
  lastUpdate: "Síðast uppfært",
  next48: "Næstu 48 klst.",
  axTemp: "Hiti (°C)",
  axWind: "Vindur (m/s)",
  fullscreen: "Fullskjár",
  exitFullscreen: "Loka fullskjá",
  scrubSlider: "Tími spár",
  minimize: "Minnka",
  expand: "Stækka",
  resize: "Breyta stærð",
  monthsShort: [
    "jan", "feb", "mar", "apr", "maí", "jún",
    "júl", "ágú", "sep", "okt", "nóv", "des",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Greiningartími: ${analysis} · Síðast uppfært: ${lastUpdate}`,
};

const en: Labels = {
  nextHours: (h) => `Next ${h} hours`,
  swipe: "swipe sideways →",
  legTemp: "Temp (°C)",
  legPrecip: "Precip (mm)",
  legPmax: "Max precip (mm)",
  legWind: "Wind (m/s)",
  legGust: "Gusts (m/s)",
  laneTemp: "Temp",
  lanePrecip: "Precip",
  laneWind: "Wind",
  loading: "Loading forecast…",
  error: "Could not load the forecast",
  retry: "Retry",
  close: "Close",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  dayLabel: (wd, day, month) => `${wd} ${day} ${month}`,
  dateLabel: (day, month) => `${day} ${month}`,
  now: "The weather now",
  feels: "Feels like",
  precip: "Precipitation",
  wind: "Wind",
  table: "Table",
  graph: "Graph",
  today: "Today",
  tomorrow: "Tomorrow",
  timeCol: "Time",
  tempCol: "Temp",
  settings: "Settings",
  forecastModel: "Forecast model",
  language: "Language",
  location: "Location",
  search: "Search for a place or station…",
  analysis: "Analysis",
  lastUpdate: "Last update",
  next48: "Next 48 hours",
  axTemp: "Temp (°C)",
  axWind: "Wind (m/s)",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  scrubSlider: "Forecast time",
  minimize: "Minimize",
  expand: "Expand",
  resize: "Resize",
  monthsShort: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Analysis: ${analysis} · Last update: ${lastUpdate}`,
};

// NOTE: es/pl/pt/fo added 2026-07-14 to match Mímir's app locales. Weather terms
// (temp/wind/precip/gust/direction) reuse Mímir's own locale wording; the rest is
// translated. FLAG: Faroese (fo) especially — and pl/es/pt to a lesser degree —
// should get a native-speaker review before shipping (compass abbreviations and a
// few UI verbs are best-effort).
const es: Labels = {
  nextHours: (h) => `Próximas ${h} h`,
  swipe: "desliza de lado →",
  legTemp: "Temp. (°C)",
  legPrecip: "Precip. (mm)",
  legPmax: "Precip. máx. (mm)",
  legWind: "Viento (m/s)",
  legGust: "Rachas (m/s)",
  laneTemp: "Temp.",
  lanePrecip: "Precip.",
  laneWind: "Viento",
  loading: "Cargando pronóstico…",
  error: "No se pudo cargar el pronóstico",
  retry: "Reintentar",
  close: "Cerrar",
  weekdays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  months: [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ],
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  dayLabel: (wd, day, month) => `${wd} ${day} ${month}`,
  dateLabel: (day, month) => `${day} ${month}`,
  now: "El tiempo ahora",
  feels: "Sensación",
  precip: "Precipitación",
  wind: "Viento",
  table: "Tabla",
  graph: "Gráfico",
  today: "Hoy",
  tomorrow: "Mañana",
  timeCol: "Hora",
  tempCol: "Temp.",
  settings: "Ajustes",
  forecastModel: "Modelo de pronóstico",
  language: "Idioma",
  location: "Ubicación",
  search: "Busca un lugar o estación…",
  analysis: "Análisis",
  lastUpdate: "Última actualización",
  next48: "Próximas 48 h",
  axTemp: "Temp. (°C)",
  axWind: "Viento (m/s)",
  fullscreen: "Pantalla completa",
  exitFullscreen: "Salir de pantalla completa",
  scrubSlider: "Hora del pronóstico",
  minimize: "Minimizar",
  expand: "Ampliar",
  resize: "Cambiar tamaño",
  monthsShort: [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Análisis: ${analysis} · Última actualización: ${lastUpdate}`,
};

const pt: Labels = {
  nextHours: (h) => `Próximas ${h} h`,
  swipe: "deslize para o lado →",
  legTemp: "Temp. (°C)",
  legPrecip: "Precip. (mm)",
  legPmax: "Precip. máx. (mm)",
  legWind: "Vento (m/s)",
  legGust: "Rajadas (m/s)",
  laneTemp: "Temp.",
  lanePrecip: "Precip.",
  laneWind: "Vento",
  loading: "A carregar previsão…",
  error: "Não foi possível carregar a previsão",
  retry: "Tentar de novo",
  close: "Fechar",
  weekdays: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  months: [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ],
  compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
  dayLabel: (wd, day, month) => `${wd} ${day} ${month}`,
  dateLabel: (day, month) => `${day} ${month}`,
  now: "O tempo agora",
  feels: "Sensação",
  precip: "Precipitação",
  wind: "Vento",
  table: "Tabela",
  graph: "Gráfico",
  today: "Hoje",
  tomorrow: "Amanhã",
  timeCol: "Hora",
  tempCol: "Temp.",
  settings: "Definições",
  forecastModel: "Modelo de previsão",
  language: "Idioma",
  location: "Localização",
  search: "Procurar um local ou estação…",
  analysis: "Análise",
  lastUpdate: "Última atualização",
  next48: "Próximas 48 h",
  axTemp: "Temp. (°C)",
  axWind: "Vento (m/s)",
  fullscreen: "Ecrã inteiro",
  exitFullscreen: "Sair do ecrã inteiro",
  scrubSlider: "Hora da previsão",
  minimize: "Minimizar",
  expand: "Expandir",
  resize: "Redimensionar",
  monthsShort: [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Análise: ${analysis} · Última atualização: ${lastUpdate}`,
};

const pl: Labels = {
  nextHours: (h) => `Następne ${h} godz.`,
  swipe: "przesuń w bok →",
  legTemp: "Temp. (°C)",
  legPrecip: "Opad (mm)",
  legPmax: "Maks. opad (mm)",
  legWind: "Wiatr (m/s)",
  legGust: "Porywy (m/s)",
  laneTemp: "Temp.",
  lanePrecip: "Opad",
  laneWind: "Wiatr",
  loading: "Ładowanie prognozy…",
  error: "Nie udało się wczytać prognozy",
  retry: "Ponów",
  close: "Zamknij",
  weekdays: ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."],
  months: [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
  ],
  compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  dayLabel: (wd, day, month) => `${wd} ${day} ${month}`,
  dateLabel: (day, month) => `${day} ${month}`,
  now: "Pogoda teraz",
  feels: "Odczuwalna",
  precip: "Opady",
  wind: "Wiatr",
  table: "Tabela",
  graph: "Wykres",
  today: "Dziś",
  tomorrow: "Jutro",
  timeCol: "Godz.",
  tempCol: "Temp.",
  settings: "Ustawienia",
  forecastModel: "Model prognozy",
  language: "Język",
  location: "Lokalizacja",
  search: "Szukaj miejsca lub stacji…",
  analysis: "Analiza",
  lastUpdate: "Ostatnia aktualizacja",
  next48: "Następne 48 godz.",
  axTemp: "Temp. (°C)",
  axWind: "Wiatr (m/s)",
  fullscreen: "Pełny ekran",
  exitFullscreen: "Zamknij pełny ekran",
  scrubSlider: "Godzina prognozy",
  minimize: "Zminimalizuj",
  expand: "Powiększ",
  resize: "Zmień rozmiar",
  monthsShort: [
    "sty", "lut", "mar", "kwi", "maj", "cze",
    "lip", "sie", "wrz", "paź", "lis", "gru",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Analiza: ${analysis} · Ostatnia aktualizacja: ${lastUpdate}`,
};

const fo: Labels = {
  nextHours: (h) => `Næstu ${h} tímar`,
  swipe: "strúka til viðrar →",
  legTemp: "Hiti (°C)",
  legPrecip: "Avfall (mm)",
  legPmax: "Mest avfall (mm)",
  legWind: "Vindur (m/s)",
  legGust: "Vindhviða (m/s)",
  laneTemp: "Hiti",
  lanePrecip: "Avfall",
  laneWind: "Vindur",
  loading: "Innlesur spá…",
  error: "Kundi ikki innlesa spáðuna",
  retry: "Royn aftur",
  close: "Lat aftur",
  weekdays: ["sun.", "mán.", "týs.", "mik.", "hós.", "frí.", "ley."],
  months: [
    "januar", "februar", "mars", "apríl", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember",
  ],
  compass: ["N", "NE", "E", "SE", "S", "SV", "V", "NV"],
  dayLabel: (wd, day, month) => `${wd} ${day}. ${month}`,
  dateLabel: (day, month) => `${day}. ${month}`,
  now: "Veðrið nú",
  feels: "Kennist sum",
  precip: "Avfall",
  wind: "Vindur",
  table: "Talva",
  graph: "Grafur",
  today: "Í dag",
  tomorrow: "Í morgin",
  timeCol: "Kl.",
  tempCol: "Hiti",
  settings: "Stillingar",
  forecastModel: "Spálíkan",
  language: "Mál",
  location: "Staður",
  search: "Leita eftir stað ella veðurstöð…",
  analysis: "Greiningartíð",
  lastUpdate: "Seinast dagført",
  next48: "Næstu 48 tímar",
  axTemp: "Hiti (°C)",
  axWind: "Vindur (m/s)",
  fullscreen: "Fullur skermur",
  exitFullscreen: "Lat fullan skerm aftur",
  scrubSlider: "Spátíð",
  minimize: "Minka",
  expand: "Stækka",
  resize: "Broyt stødd",
  monthsShort: [
    "jan", "feb", "mar", "apr", "mai", "jun",
    "jul", "aug", "sep", "okt", "nov", "des",
  ],
  metaLine: (analysis, lastUpdate) =>
    `Greiningartíð: ${analysis} · Seinast dagført: ${lastUpdate}`,
};

const all: Record<string, Labels> = { is, en, fo, pl, es, pt };

/** Languages offered in the widget's settings switcher (native names), in the
 *  order Mímir lists them. Only codes present in `all` are shown. */
export const LANGS: { code: string; name: string }[] = [
  { code: "is", name: "Íslenska" },
  { code: "en", name: "English" },
  { code: "fo", name: "Føroyskt" },
  { code: "pl", name: "Polski" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
];

/** Default Icelandic, per the Mimir handoff */
export function labels(lang: string): Labels {
  return all[lang] ?? all.is;
}
