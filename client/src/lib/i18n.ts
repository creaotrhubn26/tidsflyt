import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  nb: {
    translation: {
      common: {
        loading: 'Laster...',
        error: 'Feil',
        success: 'Suksess',
        save: 'Lagre',
        cancel: 'Avbryt',
        delete: 'Slett',
        edit: 'Rediger',
        close: 'Lukk',
        back: 'Tilbake',
      },
      auth: {
        login: 'Logg inn',
        logout: 'Logg ut',
        unauthorized: 'Ikke autorisert',
        loginRequired: 'Du må være logget inn',
      },
      timeTracking: {
        stampIn: 'Stemple INN',
        stampOut: 'Stemple UT',
        activity: 'Aktivitet',
        title: 'Tittel',
        project: 'Prosjekt',
        place: 'Sted',
        notes: 'Notater',
        duration: 'Varighet',
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
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        close: 'Close',
        back: 'Back',
      },
      auth: {
        login: 'Log in',
        logout: 'Log out',
        unauthorized: 'Unauthorized',
        loginRequired: 'You must be logged in',
      },
      timeTracking: {
        stampIn: 'Clock IN',
        stampOut: 'Clock OUT',
        activity: 'Activity',
        title: 'Title',
        project: 'Project',
        place: 'Location',
        notes: 'Notes',
        duration: 'Duration',
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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'nb', // Default Norwegian
    fallbackLng: 'nb',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
