// Initialisation Firebase (SDK npm typé) pour l'app Astro. Remplace les imports
// gstatic globaux de l'ancien core.js. Config web = non secrète ; la sécurité
// repose sur les règles Firestore + App Check (cf. CLAUDE.md).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyAM6s43G5e55LduqW9KYcEXgJDsh6pGUQs',
  authDomain: 'refrao-b6ae3.firebaseapp.com',
  projectId: 'refrao-b6ae3',
  storageBucket: 'refrao-b6ae3.firebasestorage.app',
  messagingSenderId: '39410882551',
  appId: '1:39410882551:web:a5bea039d593d230b8c0f2'
};
const RECAPTCHA_SITE_KEY = '6LcudhstAAAAAOKPHV_s6emz1k5J9DNaQX7y8kt3';

export const app: FirebaseApp = initializeApp(firebaseConfig);

// App Check (anti-abus/scraping), ENFORCEMENT actif en prod. En dev local,
// reCAPTCHA v3 ne valide pas localhost : on active le jeton de débogage, qui
// s'affiche une fois dans la console du navigateur et doit être enregistré une
// seule fois dans Firebase Console > App Check > jetons de débogage.
if (import.meta.env.DEV) {
  (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
try {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
} catch (e) {
  console.error('App Check init:', e);
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
