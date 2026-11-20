# Neuro Reparto

App per telefono (web app installabile) con le attività dei pazienti dei reparti di Neurologia. Si aggiorna in tempo reale per tutti i medici collegati e invia notifiche push.

- Reparti: **Stroke (8)**, **PUCA (8)**, **Ospedaliera (8)**, **Amaducci Uomini (10)**, **Amaducci Donne (10)**. I letti si possono aggiungere, rinominare ed eliminare dall'app.
- Per ogni letto: **paziente**, **appunti**, **attività** e **sotto-attività** da spuntare. Le attività si possono segnare come **urgenti**.
- Un'attività spuntata sparisce dalla lista. Resta nello storico (pulsante **"Fatte"**, ultimi 3 giorni) con chi l'ha fatta e quando. Subito dopo la spunta compare **"Annulla"** per correggere un errore.
- Spuntando un'attività vengono chiuse anche le sue sotto-attività.
- **🌙 Guardia**: una scheda unica con i pazienti di tutti i reparti che hanno una consegna, ordinati per gravità. Per ogni paziente: gravità (da monitorare / critico), stato rianimatorio, allergie, notizie principali e valutazioni da fare con orario. Si vede chi ha aggiornato la consegna e quando, con un avviso se è più vecchia di 24 ore. Si può stampare come copia di riserva.
- Si può **trasferire** un paziente in un altro letto, anche di un altro reparto, oppure **dimetterlo**.
- **Notifiche push**: ogni medico sceglie i reparti da seguire e riceve un avviso quando un collega aggiunge un'attività. Chi la crea non riceve la propria notifica.
- Accesso solo con account personale, creato da te: non ci si può registrare da soli.

Servizi usati, tutti con piano gratuito: **Supabase** (database, login, tempo reale, notifiche), e **GitHub** (codice e pubblicazione automatica con GitHub Pages).

---

## Aggiornare un database già creato
Se hai già eseguito lo schema in passato, riesegui semplicemente tutto [`supabase/schema.sql`](supabase/schema.sql) nell'editor SQL. Lo script aggiunge solo ciò che manca (per esempio i campi della guardia) e non cancella nessun dato. Poi ripubblica la funzione notifiche (`npx supabase functions deploy notifica --no-verify-jwt`) e l'app.

## 1. Crea il progetto Supabase
1. Registrati su https://supabase.com, poi **New project**.
2. **Region: Central EU (Frankfurt)**, così i dati restano in UE. Scegli una password robusta per il database e conservala.
3. Apri **SQL Editor → New query**, incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
   Vengono create le tabelle, le regole di sicurezza, il tempo reale e i 5 reparti con i 44 letti.

## 2. Blocca le registrazioni libere
- **Authentication → Sign In / Providers → Email**: lascia attivo Email.
- Disattiva **"Allow new users to sign up"**.
- **Authentication → URL Configuration → Site URL**: lo inserirai al passo 6, quando avrai l'indirizzo dell'app.

## 3. Crea gli account dei medici
**Pochi medici:** da **Authentication → Users → Add user → Create new user**. Inserisci email e password e spunta **Auto Confirm User**. Ogni medico imposta poi il proprio nome dalle Impostazioni (⚙︎).

**Tutti insieme (consigliato per 60 medici):**
1. Compila un file CSV come [`scripts/medici-esempio.csv`](scripts/medici-esempio.csv) (`email,nome,password`).
2. Prendi la chiave segreta da **Project Settings → API Keys**: si chiama **service_role** oppure **secret key** (`sb_secret_…`). Dà accesso completo al database: non condividerla e non metterla nell'app.
3. Dal tuo computer, nella cartella del progetto:
   ```bash
   npm install
   ```
   ```bash
   SUPABASE_URL=https://TUO-PROGETTO.supabase.co SUPABASE_SERVICE_ROLE_KEY=chiave-service-role node scripts/crea-utenti.mjs medici.csv
   ```
4. Comunica a ciascuno la password provvisoria e chiedigli di cambiarla da ⚙︎ → **Cambia password**.

## 4. Genera le chiavi per le notifiche (VAPID)
```bash
npx web-push generate-vapid-keys
```
Si ottengono una **Public Key** e una **Private Key**. La pubblica va nell'app (passo 6), la privata solo su Supabase (passo 5).

## 5. Attiva l'invio delle notifiche (Edge Function)
Dalla cartella del progetto:
```bash
npx supabase login
```
```bash
npx supabase link --project-ref TUO-PROJECT-REF
```
(il *project ref* è il codice nell'indirizzo del progetto: `https://supabase.com/dashboard/project/<ref>`)

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=chiave-pubblica VAPID_PRIVATE_KEY=chiave-privata VAPID_SUBJECT=mailto:tua-email@ospedale.it WEBHOOK_SECRET=una-parola-segreta-lunga
```
```bash
npx supabase functions deploy notifica --no-verify-jwt
```

Poi collega la funzione al database:
1. **Database → Webhooks** (nelle versioni più recenti: **Integrations → Database Webhooks**) → **Create a new hook**; se richiesto, prima **Enable webhooks**.
2. Nome: `notifica`. Tabella: **attivita**. Eventi: solo **Insert**.
3. Tipo: **Supabase Edge Functions**, funzione **notifica**, metodo POST.
4. In **HTTP Headers** aggiungi `x-webhook-secret` = la stessa parola segreta usata sopra.
5. **Create webhook**.

## 6. Pubblica l'app (GitHub Pages)
L'app viene costruita e pubblicata da GitHub stesso (file `.github/workflows/pubblica.yml`).
Ogni modifica caricata sul ramo `main` va online da sola in 1–2 minuti. Non servono altri servizi.

> Il repository deve essere **pubblico** (GitHub Pages è gratuito solo per i repository pubblici).
> Il codice non contiene dati né password: i dati stanno su Supabase e le chiavi nei *Secrets* di GitHub.

1. **Rendi pubblico il repository** (una volta sola): *Settings → General* → in fondo, *Danger Zone* → **Change visibility** → **Public**.
2. **Attiva GitHub Pages** (una volta sola): *Settings → Pages* → *Build and deployment* → **Source: GitHub Actions**.
3. **Inserisci le chiavi**: *Settings → Secrets and variables → Actions* → **New repository secret**:
   | Nome | Valore |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL di Supabase |
   | `VITE_SUPABASE_ANON_KEY` | chiave anon / publishable di Supabase (**mai** la secret) |
   | `VITE_VAPID_PUBLIC_KEY` | (facoltativa) chiave pubblica VAPID per le notifiche |
4. **Pubblica**: scheda **Actions** → **Pubblica l'app** → **Run workflow**. Dopo 1–2 minuti l'app è online su
   `https://<organizzazione>.github.io/<nome-repository>/` (l'indirizzo esatto compare in *Settings → Pages*).
5. **Supabase** → *Authentication → URL Configuration*: inserisci quell'indirizzo come **Site URL**
   e aggiungilo anche in **Redirect URLs**.
6. (Consigliato) *Settings → General → Features*: togli la spunta a **Issues**, così nessun estraneo può scrivervi.

**Se la pubblicazione non va** (pallino rosso in *Actions*): apri l'esecuzione fallita; il primo passo
"Controllo chiavi" dice se manca qualche chiave.

**Spostare l'app altrove** (Netlify, server dell'ospedale…): l'app funziona anche alla radice di un sito.
`npm run build` crea la cartella `dist` da copiare su qualsiasi server web (per Netlify c'è già `netlify.toml`).

## 7. Installare l'app sul telefono
- **iPhone (Safari)**: apri l'indirizzo, tocca **Condividi → Aggiungi alla schermata Home**. Apri l'app **dall'icona**, poi ⚙︎ → **Attiva notifiche**. Su iPhone le notifiche funzionano solo dall'icona sulla Home, con iOS 16.4 o successivo.
- **Android (Chrome)**: apri l'indirizzo, poi menu ⋮ → **Installa app** (o "Aggiungi a schermata Home"), quindi ⚙︎ → **Attiva notifiche**.

---

## Provarla sul computer
```bash
cp .env.example .env
```
Compila `.env` con i tuoi valori, poi:
```bash
npm install
```
```bash
npm run dev
```
Apri http://localhost:5173.

## Come si usa
| Azione | Come |
|---|---|
| Cambiare reparto | Schede in alto |
| Ricoverare un paziente | Letto libero → **+ Paziente** |
| Modificare nome o appunti, trasferire, dimettere | Tocca il nome del paziente (✎) |
| Nuova attività | Campo "Nuova attività…" in fondo alla scheda; **!** per segnarla urgente |
| Sotto-attività | **↳+** accanto all'attività (puoi scriverne più di una, una per riga) |
| Segnare come fatta | Tocca la casella; compare **Annulla** per qualche secondo |
| Modificare, segnare urgente o eliminare un'attività | Tocca il testo dell'attività |
| Scrivere la consegna per la guardia | 🌙 sulla scheda del paziente |
| Valutazione da fare in guardia | 🌙 accanto a "Nuova attività…", oppure dalla scheda **🌙 Guardia** (con orario) |
| Stampare le consegne | Scheda **🌙 Guardia** → **🖨 Stampa** |
| Vedere le attività fatte | Pulsante **Fatte** |
| Vedere solo i letti con qualcosa da fare | Pulsante **Con attività** |
| Aggiungere un letto | **+ Aggiungi letto** in fondo alla lista |
| Rinominare o eliminare un letto libero | **⋯** sul letto libero |

## Limiti del piano gratuito
- **Pausa dopo 7 giorni senza utilizzo**: con l'uso quotidiano non succede.
- **Nessun backup automatico** nel piano gratuito. Fai un'esportazione periodica da **Database → Backups** o con `npx supabase db dump`, oppure passa al piano Pro (circa 25 $/mese) che include i backup giornalieri.
- Consumi stimati per 60 medici: molto al di sotto dei limiti gratuiti (dati scaricati, messaggi in tempo reale, chiamate alle funzioni).

## Privacy (GDPR)
I dati dei pazienti sono dati sanitari (art. 9 GDPR). Prima di usare l'app con pazienti reali:
- fai **approvare l'uso dal DPO** dell'ospedale;
- inserisci il minimo indispensabile, per esempio cognome e iniziale, senza codice fiscale né dati superflui negli appunti;
- usa account personali e non condividere le password;
- se l'ospedale lo richiede, Supabase si può installare sui server interni (self-hosting con Docker) senza cambiare il codice dell'app.

## Struttura del progetto
```
supabase/schema.sql                 database, sicurezza, reparti e letti iniziali
supabase/functions/notifica/        invio notifiche push (Edge Function)
scripts/crea-utenti.mjs             creazione account in blocco da CSV
src/App.jsx                         interfaccia
src/push.js                         iscrizione alle notifiche
public/sw.js                        service worker (riceve le notifiche)
```
