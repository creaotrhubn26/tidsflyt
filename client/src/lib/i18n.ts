/**
 * i18n initialisation. Wired in App.tsx via the bare import side-effect.
 * Language is decided by:
 *   1. localStorage `tidum_lang` (mirrors the user's saved preference)
 *   2. server-side user.language fetched on app mount (use-language-sync hook)
 *   3. browser preferredLanguages (English if user's system is English)
 *   4. default Norwegian
 *
 * Coverage is intentionally focused: the most-visible chrome (sidebar,
 * common buttons, settings, login). Page bodies remain Norwegian until
 * we extract them in follow-up work.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  nb: {
    translation: {
      common: {
        loading: 'Laster…',
        error: 'Feil',
        success: 'Suksess',
        save: 'Lagre',
        cancel: 'Avbryt',
        delete: 'Slett',
        remove: 'Fjern',
        edit: 'Rediger',
        close: 'Lukk',
        back: 'Tilbake',
        send: 'Send',
        next: 'Neste',
        previous: 'Forrige',
        search: 'Søk',
        filter: 'Filter',
        more: 'Mer',
        all: 'Alle',
        none: 'Ingen',
        yes: 'Ja',
        no: 'Nei',
        today: 'I dag',
        yesterday: 'I går',
        tomorrow: 'I morgen',
        confirm: 'Bekreft',
        copy: 'Kopier',
        download: 'Last ned',
        upload: 'Last opp',
        new: 'Ny',
        add: 'Legg til',
        update: 'Oppdater',
        refresh: 'Oppdater',
        retry: 'Prøv igjen',
        share: 'Del',
        print: 'Skriv ut',
        export: 'Eksporter',
        import: 'Importer',
      },
      auth: {
        login: 'Logg inn',
        loginWithGoogle: 'Logg inn med Google',
        logout: 'Logg ut',
        signup: 'Registrer deg',
        email: 'E-post',
        password: 'Passord',
        forgotPassword: 'Glemt passord?',
        unauthorized: 'Ikke autorisert',
        loginRequired: 'Du må være logget inn',
        requestAccess: 'Be om tilgang',
      },
      nav: {
        dashboard: 'Dashboard',
        tiltaksleder: 'Tiltaksleder',
        gettingStarted: 'Kom i gang med Tidum',
        saker: 'Saker',
        institusjoner: 'Institusjoner',
        invitasjoner: 'Invitasjoner',
        rapporter: 'Rapporter',
        godkjenning: 'Godkjenning',
        rapportMaler: 'Rapport-maler',
        avvik: 'Avvik',
        timeforing: 'Timeføring',
        timelister: 'Timelister',
        overtid: 'Overtid',
        fravar: 'Fravær',
        fasteOppgaver: 'Faste oppgaver',
        fakturaer: 'Fakturaer',
        epost: 'E-post',
        sendVidere: 'Send videre',
        leverandorer: 'Leverandører',
        cms: 'CMS',
        testerFeedback: 'Tester-feedback',
        innstillinger: 'Innstillinger',
        compose: 'Skriv e-post',
        categories: {
          oversikt: 'Oversikt',
          saker: 'Saker & klienter',
          rapportering: 'Rapportering',
          tid: 'Tid & fravær',
          kommunikasjon: 'Økonomi & kommunikasjon',
          administrasjon: 'Administrasjon',
          system: 'System',
        },
      },
      settings: {
        title: 'Innstillinger',
        profile: 'Profil',
        language: 'Språk',
        languageNorwegian: 'Norsk',
        languageEnglish: 'Engelsk',
        theme: 'Tema',
        themeLight: 'Lyst',
        themeDark: 'Mørkt',
        themeAuto: 'Auto (følg system)',
        notifications: 'Varsler',
        gdpr: 'GDPR-hjelper',
        gdprAutoReplace: 'Anonymiser automatisk',
        gdprDescription: 'Erstatt navn og personnummer i fritekst før lagring',
        saved: 'Innstillinger lagret',
        savedError: 'Kunne ikke lagre',
      },
      email: {
        compose: 'Skriv e-post',
        newEmail: 'Ny e-post',
        to: 'Til',
        cc: 'Cc',
        bcc: 'Bcc',
        subject: 'Emne',
        body: 'Melding',
        send: 'Send',
        schedule: 'Planlegg',
        scheduleSending: 'Planlegg sending',
        sendNow: 'Send nå',
        templates: 'Maler',
        team: 'Team',
        attachments: 'Vedlegg',
        attach: 'Vedlegg',
        aiDraft: 'AI-utkast',
        preview: 'Forhåndsvis',
        editing: 'Rediger',
        draftSaved: 'Utkast lagret',
        savingDraft: 'Lagrer…',
        sent: 'E-post sendt',
        scheduled: 'Planlagt sending lagret',
        sendError: 'Kunne ikke sende',
        emptyDraft: 'Skriv meldingen din her…',
        recipientPlaceholder: 'e-post@eksempel.no',
      },
      errors: {
        networkError: 'Nettverksfeil. Sjekk tilkoblingen din.',
        serverError: 'Serverfeil. Prøv igjen senere.',
        validationError: 'Valideringsfeil. Sjekk inndataene dine.',
        unauthorized: 'Du har ikke tilgang til denne ressursen.',
      },
    },
  },
  en: {
    translation: {
      common: {
        loading: 'Loading…',
        error: 'Error',
        success: 'Success',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        remove: 'Remove',
        edit: 'Edit',
        close: 'Close',
        back: 'Back',
        send: 'Send',
        next: 'Next',
        previous: 'Previous',
        search: 'Search',
        filter: 'Filter',
        more: 'More',
        all: 'All',
        none: 'None',
        yes: 'Yes',
        no: 'No',
        today: 'Today',
        yesterday: 'Yesterday',
        tomorrow: 'Tomorrow',
        confirm: 'Confirm',
        copy: 'Copy',
        download: 'Download',
        upload: 'Upload',
        new: 'New',
        add: 'Add',
        update: 'Update',
        refresh: 'Refresh',
        retry: 'Retry',
        share: 'Share',
        print: 'Print',
        export: 'Export',
        import: 'Import',
      },
      auth: {
        login: 'Log in',
        loginWithGoogle: 'Log in with Google',
        logout: 'Log out',
        signup: 'Sign up',
        email: 'Email',
        password: 'Password',
        forgotPassword: 'Forgot password?',
        unauthorized: 'Unauthorized',
        loginRequired: 'You must be logged in',
        requestAccess: 'Request access',
      },
      nav: {
        dashboard: 'Dashboard',
        tiltaksleder: 'Team leader',
        gettingStarted: 'Get started with Tidum',
        saker: 'Cases',
        institusjoner: 'Institutions',
        invitasjoner: 'Invitations',
        rapporter: 'Reports',
        godkjenning: 'Approvals',
        rapportMaler: 'Report templates',
        avvik: 'Incidents',
        timeforing: 'Time tracking',
        timelister: 'Timesheets',
        overtid: 'Overtime',
        fravar: 'Leave',
        fasteOppgaver: 'Recurring tasks',
        fakturaer: 'Invoices',
        epost: 'Email',
        sendVidere: 'Forward',
        leverandorer: 'Vendors',
        cms: 'CMS',
        testerFeedback: 'Tester feedback',
        innstillinger: 'Settings',
        compose: 'Write email',
        categories: {
          oversikt: 'Overview',
          saker: 'Cases & clients',
          rapportering: 'Reporting',
          tid: 'Time & leave',
          kommunikasjon: 'Finance & communication',
          administrasjon: 'Administration',
          system: 'System',
        },
      },
      settings: {
        title: 'Settings',
        profile: 'Profile',
        language: 'Language',
        languageNorwegian: 'Norwegian',
        languageEnglish: 'English',
        theme: 'Theme',
        themeLight: 'Light',
        themeDark: 'Dark',
        themeAuto: 'Auto (follow system)',
        notifications: 'Notifications',
        gdpr: 'GDPR helper',
        gdprAutoReplace: 'Anonymize automatically',
        gdprDescription: 'Replace names and ID numbers in free text before saving',
        saved: 'Settings saved',
        savedError: 'Could not save',
      },
      email: {
        compose: 'Write email',
        newEmail: 'New email',
        to: 'To',
        cc: 'Cc',
        bcc: 'Bcc',
        subject: 'Subject',
        body: 'Message',
        send: 'Send',
        schedule: 'Schedule',
        scheduleSending: 'Schedule send',
        sendNow: 'Send now',
        templates: 'Templates',
        team: 'Team',
        attachments: 'Attachments',
        attach: 'Attach',
        aiDraft: 'AI draft',
        preview: 'Preview',
        editing: 'Edit',
        draftSaved: 'Draft saved',
        savingDraft: 'Saving…',
        sent: 'Email sent',
        scheduled: 'Scheduled send saved',
        sendError: 'Could not send',
        emptyDraft: 'Write your message here…',
        recipientPlaceholder: 'name@example.com',
      },
      errors: {
        networkError: 'Network error. Check your connection.',
        serverError: 'Server error. Try again later.',
        validationError: 'Validation error. Check your inputs.',
        unauthorized: 'You do not have access to this resource.',
      },
    },
  },
};

const STORAGE_KEY = 'tidum_lang';

/** Pick the initial language: localStorage → browser hint → Norwegian. */
function pickInitialLanguage(): 'nb' | 'en' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'nb' || stored === 'en') return stored;
  } catch {}
  if (typeof navigator !== 'undefined') {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const lower = (l || '').toLowerCase();
      if (lower.startsWith('nb') || lower.startsWith('no')) return 'nb';
      if (lower.startsWith('en')) return 'en';
    }
  }
  return 'nb';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: pickInitialLanguage(),
    fallbackLng: 'nb',
    interpolation: { escapeValue: false },
  });

/** Map both internal codes ('no' from server, 'nb' canonical) to i18next codes. */
export function setAppLanguage(lang: string | null | undefined) {
  const target = (lang === 'en') ? 'en' : 'nb';
  if (i18n.language !== target) i18n.changeLanguage(target);
  try { localStorage.setItem(STORAGE_KEY, target); } catch {}
}

export default i18n;
