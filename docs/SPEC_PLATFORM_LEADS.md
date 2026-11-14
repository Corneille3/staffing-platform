# SPEC_PLATFORM_LEADS — Pipeline de prospects au niveau opérateur

**Statut :** proposé · **Niveau :** `/platform` (opérateur de plateforme) · **Version :** 1.0 · 2026-09-10

## 1. Objectif

Donner à l'opérateur de plateforme un pipeline de prospects **avant** qu'un tenant existe, relié au bouton « Invite a network » existant, pour que chaque tenant créé ait une origine traçable (source, segment, délai de conversion).

Aujourd'hui `/platform/tenants` commence à l'étape « invitation envoyée ». Les trois étapes précédentes (prospect identifié → contacté → démo) n'existent nulle part dans le produit.

## 2. Non-objectifs (v1)

- Pas de séquences courriel automatisées ni d'envoi de masse.
- Pas d'accès aux leads pour les tenants ou les coordonnateurs — module **exclusivement** `platform_operator`.
- Pas de scoring automatique côté serveur (le score reste une valeur saisie/importée ; formule v2).
- Pas d'intégration CRM externe (HubSpot, etc.).
- Aucun lien entre un lead et des données internes d'un tenant. La règle existante « *never see inside their data* » reste intacte : les leads décrivent des organisations **qui ne sont pas encore tenants**.

## 3. Modèle de données

### 3.1 Table `platform_leads`

```sql
CREATE TYPE lead_segment AS ENUM (
  'rpa_qc', 'chsld_qc', 'cpe_qc', 'ltc_on', 'retirement_on', 'agency_on', 'school_board', 'other'
);
CREATE TYPE lead_kind AS ENUM ('prospect', 'enterprise', 'channel');
CREATE TYPE lead_status AS ENUM (
  'new', 'contacted', 'demo_booked', 'pilot', 'invited', 'won', 'lost'
);
CREATE TYPE lead_source AS ENUM (
  'research', 'facebook_ad', 'linkedin_dm', 'website_form', 'referral', 'cold_outreach', 'event', 'other'
);
CREATE TYPE agency_ban_phase AS ENUM ('P1', 'P2', 'P3', 'none');

CREATE TABLE platform_leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref       TEXT UNIQUE,                 -- ex. "L017" (import xlsx), nullable
  org_name           TEXT NOT NULL,
  segment            lead_segment NOT NULL,
  subtype            TEXT,                        -- "RPA", "CHSLD conventionné", "CPE + BC"…
  kind               lead_kind NOT NULL DEFAULT 'prospect',
  site_count         INTEGER CHECK (site_count >= 0),
  capacity_note      TEXT,                        -- "426 lits", "BC 1 078 places / 125 RSG"
  city               TEXT,
  province           CHAR(2) NOT NULL,            -- 'QC' | 'ON'
  regions            TEXT,
  agency_ban_phase   agency_ban_phase NOT NULL DEFAULT 'none',
  language           CHAR(2) NOT NULL DEFAULT 'fr',
  website            TEXT,
  phone              TEXT,
  email              TEXT,
  contact_name       TEXT,                        -- niveau organisation seulement
  contact_title      TEXT,
  hiring_signal      BOOLEAN,                     -- affiche des postes PAB/inf. ?
  score              SMALLINT CHECK (score BETWEEN 0 AND 10),
  wave               CHAR(1),                     -- 'A' | 'B' | 'C' | NULL (canal)
  status             lead_status NOT NULL DEFAULT 'new',
  lost_reason        TEXT,
  source             lead_source NOT NULL DEFAULT 'research',
  source_detail      TEXT,                        -- id de pub, nom du référent…
  next_action        TEXT,
  next_action_at     DATE,
  notes              TEXT,
  source_url         TEXT,
  converted_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  converted_at       TIMESTAMPTZ,
  created_by         UUID NOT NULL,               -- user_id Clerk de l'opérateur
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON platform_leads (status);
CREATE INDEX ON platform_leads (segment);
CREATE INDEX ON platform_leads (next_action_at) WHERE status NOT IN ('won','lost');
```

### 3.2 Table `platform_lead_events` (fil d'activité)

```sql
CREATE TYPE lead_event_type AS ENUM (
  'created', 'status_changed', 'note', 'call', 'email', 'meeting', 'demo', 'invited', 'converted', 'imported', 'form_submitted'
);

CREATE TABLE platform_lead_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES platform_leads(id) ON DELETE CASCADE,
  type        lead_event_type NOT NULL,
  from_status lead_status,
  to_status   lead_status,
  body        TEXT,
  actor_id    UUID,                               -- NULL si système (formulaire, import)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON platform_lead_events (lead_id, created_at DESC);
```

### 3.3 Ajout à `tenants`

```sql
ALTER TABLE tenants ADD COLUMN lead_id UUID UNIQUE REFERENCES platform_leads(id) ON DELETE SET NULL;
```

Nullable : les 3 tenants existants n'ont pas de lead.

## 4. Machine à états

```
new ──► contacted ──► demo_booked ──► pilot ──► invited ──► won
 │          │             │            │          │
 └──────────┴─────────────┴────────────┴──────────┴──────► lost
```

Règles :

- Toute transition écrit un `status_changed` dans `platform_lead_events`.
- `lost` exige `lost_reason` non vide. `lost` est réversible vers `contacted` (réactivation).
- `invited` est **posé par le système** quand l'opérateur clique « Invite a network » depuis la fiche lead (voir §7). Il peut aussi être posé manuellement.
- `won` est **posé par le système** quand le tenant lié passe à `active` (premier login admin ou activation manuelle, selon ce que `tenants.status` fait déjà). Pose aussi `converted_at` et `converted_tenant_id`.
- Un sauter d'étape est permis (ex. `new → demo_booked`) ; l'événement enregistre `from/to`.

## 5. API (FastAPI)

Préfixe `/api/platform/leads`. Dépendance : `require_platform_operator` (la même que `/api/platform/tenants`). Toute autre identité → 403, sans distinguer 403/404.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | Liste paginée. Filtres : `status`, `segment`, `province`, `wave`, `kind`, `q` (org_name ILIKE), `next_action_before`. Tri : `next_action_at`, `score desc`, `updated_at desc`. |
| POST | `/` | Créer. |
| GET | `/{id}` | Fiche + 50 derniers événements. |
| PATCH | `/{id}` | Modifier les champs éditables. Si `status` change → transition (§4). |
| POST | `/{id}/events` | Ajouter note / appel / courriel / réunion. |
| POST | `/{id}/invite` | Crée le tenant via le service d'invitation existant, pré-rempli (`org_name`, `language`, admin email = `email` si présent), pose `invited`, lie `tenants.lead_id`. Retourne le tenant. |
| POST | `/import` | `multipart/form-data` CSV ou XLSX. Colonnes attendues = en-têtes de `Staffig_Leads_2026-09.xlsx` onglet *Leads*. Upsert sur `external_ref`. Retourne `{created, updated, skipped: [{row, reason}]}`. |
| GET | `/stats` | Compteurs par statut, par segment × vague, taux de conversion, nb d'actions en retard. |
| POST | `/api/public/leads/intake` | **Sans auth.** Alimenté par `kouamvision.com/contact?intent=staffig`. Rate-limité (5/h/IP). Crée `status=new`, `source=website_form`, événement `form_submitted`. Validation stricte, honeypot, longueur max. |

Schémas Pydantic : `LeadCreate`, `LeadUpdate`, `LeadOut`, `LeadEventCreate`, `LeadStats`, `LeadImportResult`, `PublicLeadIntake`.

## 6. Interface (Next.js, `[locale]/platform/leads`)

Nouvel item de nav **Leads** entre *Tenants* et *Settings*. Même coquille visuelle que `/platform/tenants`.

### 6.1 `/platform/leads` — liste

- Bandeau 4 tuiles : **Pipeline ouvert** (non won/lost) · **Actions en retard** (`next_action_at < today`) · **Démo / pilote en cours** · **Taux de conversion** (won ÷ leads ≥ contacted).
- Tableau : Organisation · Segment · Sites · Ville/Prov. · Phase · Score · Vague · Statut · Prochaine action · Date.
- Filtres persistés dans l'URL : statut, segment, province, vague, recherche.
- Tri par défaut : `next_action_at asc nulls last`, puis `score desc`.
- Bouton **Importer** (xlsx/csv) et **Nouveau lead**.
- Ligne « Entreprise » et « Canal » distinguées par un badge, comme `Active/Suspended` l'est déjà pour les tenants.

### 6.2 `/platform/leads/[id]` — fiche

- Colonne gauche : champs éditables inline (même pattern que Settings).
- Colonne droite : **fil d'activité** (événements) + zone « Ajouter une note / appel / courriel ».
- Barre de statut cliquable (les 7 étapes) ; `lost` ouvre un champ raison obligatoire.
- Bouton **Inviter comme network** — visible seulement si `status ∉ {invited, won, lost}`. Ouvre la même modale que « Invite a network » avec les champs pré-remplis. Après succès : bandeau « Tenant créé → *Open workspace* ».
- Si `converted_tenant_id` : encart lien vers `/platform/tenants` filtré sur ce tenant, avec `converted_at` et le délai `created_at → converted_at`.

### 6.3 i18n

Clés sous `platform.leads.*` en `fr` et `en`. Libellés des statuts : Nouveau/New · Contacté/Contacted · Démo bookée/Demo booked · Pilote/Pilot · Invitation envoyée/Invited · Gagné/Won · Perdu/Lost.

## 7. Flux de conversion

1. Opérateur ouvre la fiche → **Inviter comme network**.
2. Backend : transaction — crée le tenant (service existant), `tenants.lead_id = lead.id`, lead `status = invited`, événement `invited`.
3. Quand le tenant devient actif (hook existant sur `tenants.status` ou sur le premier login admin), un listener pose `won` + `converted_at`, événement `converted`.
4. `/platform/tenants` affiche une colonne optionnelle **Origine** (segment + source du lead) — lecture seule, ne révèle rien du tenant.

## 8. Import initial

Fichier `Staffig_Leads_2026-09.xlsx`, onglet *Leads*, 101 lignes. Mapping :

| Colonne xlsx | Champ |
|---|---|
| ID | `external_ref` |
| Organisation | `org_name` |
| Segment | `segment` (map : « RPA (QC) »→`rpa_qc`, « CHSLD (QC) »→`chsld_qc`, « CPE / garderies (QC) »→`cpe_qc`, « LTC (ON) »→`ltc_on`, « Retraite (ON) »→`retirement_on`, « Agence (ON) »→`agency_on`) |
| Sous-type | `subtype` |
| Type | `kind` (Prospect/Entreprise/Canal → prospect/enterprise/channel) |
| Nb sites | `site_count` |
| Capacité | `capacity_note` |
| Ville / Prov. / Régions | `city` / `province` / `regions` |
| Phase interdiction agences | `agency_ban_phase` (« ON » → `none`) |
| Langue | `language` (FR/EN → fr/en) |
| Site web / Téléphone / Courriel | `website` / `phone` / `email` |
| Contact (publié) / Titre | `contact_name` / `contact_title` |
| Recrute PAB/inf. | `hiring_signal` (Oui→true, Non→false, —→NULL) |
| Score / Vague | `score` / `wave` (valeurs calculées, importées telles quelles) |
| Statut / Source lead / Prochaine action / Date action / Notes / URL source | `status` / `source` / `next_action` / `next_action_at` / `notes` / `source_url` |

Lignes sans `org_name` → `skipped`. Un `external_ref` déjà présent → mise à jour des champs non vides seulement (l'opérateur ne perd pas ses notes).

## 9. Sécurité et données

- Tout endpoint sous `require_platform_operator` ; l'intake public est le seul sans auth, et il n'écrit que `org_name, contact_name, email, phone, segment, notes, language`.
- Le module stocke des **coordonnées d'organisation**. Aucune donnée de travailleurs, de quarts ou d'un tenant.
- `platform_lead_events` est append-only côté API (pas de DELETE, pas de PATCH).
- Export CSV depuis la liste (bouton), pour rester propriétaire de ses données.

## 10. Migration

1. Alembic : `create enums` → `platform_leads` → `platform_lead_events` → `ALTER tenants ADD lead_id`.
2. Downgrade complet supporté (drop colonne, tables, enums).
3. Après déploiement : `POST /import` avec le xlsx ; vérifier `created == 101`.

## 11. Critères d'acceptation

- [ ] Un coordonnateur ou admin de tenant qui appelle `/api/platform/leads` reçoit 403.
- [ ] Importer le xlsx crée 101 leads ; le ré-importer crée 0, met à jour ≤ 101, ne vide aucune note existante.
- [ ] Passer un lead à `lost` sans raison → 422.
- [ ] « Inviter comme network » depuis un lead : tenant créé, `tenants.lead_id` posé, lead `invited`, événement écrit — le tout ou rien.
- [ ] Activation du tenant → lead `won` avec `converted_at`.
- [ ] Le formulaire `?intent=staffig` crée un lead `website_form` ; 6e envoi en 1 h depuis la même IP → 429.
- [ ] La liste filtrée par `wave=A&status=new` retourne les 30 leads de vague A du fichier.
- [ ] Tuile « Actions en retard » = COUNT(`next_action_at < today AND status ∉ {won, lost}`).
- [ ] Toutes les chaînes UI existent en `fr` et `en`.

## 12. Ordre d'implémentation suggéré (2 sessions Claude Code)

**Session 1 — backend** : enums + tables + migration · modèles SQLAlchemy · schémas · routeur CRUD + transitions · `/import` · tests (403, transitions, import idempotent).

**Session 2 — frontend + conversion** : nav + liste + fiche · modale d'invitation pré-remplie + `/invite` · listener `won` · intake public + branchement du formulaire kouamvision · i18n · tuile Origine sur `/platform/tenants`.

## 13. Hypothèses à vérifier dans le repo

- Nom réel de la table tenants et de sa colonne de statut (`tenants.status = 'active'`).
- Nom de la dépendance d'auth opérateur (`require_platform_operator` est un nom présumé).
- Le service d'invitation existant est appelable hors du handler HTTP (sinon l'extraire d'abord).
- Le formulaire kouamvision est un site séparé : l'intake public doit accepter un CORS restreint à `https://kouamvision.com`.

---

## 14. Décisions d'implémentation (2026-11-14)

Écarts par rapport au texte ci-dessus, décidés avec le propriétaire du produit avant de coder. En cas de contradiction, **cette section prime**.

### Accès

- Le module est réservé à **owner + marketing**. `marketing` est un 4ᵉ rôle d'opérateur (`platform_operators.role`). `operator` et `support` reçoivent 403.
- Un compte `marketing` ne peut rien faire d'autre : la résolution du scope (`auth/scope.py`) le refuse partout hors `/api/v1/platform/leads` et `/api/v1/auth`.
- Les écritures passent par la barrière 2FA (`require_platform_leads_mfa`), inactive tant que `PLATFORM_MFA_ENFORCED=false`.
- **« Inviter comme network » est réservé à l'owner.** Le marketing mène le lead jusqu'à `pilot`.
- Préfixe réel : `/api/v1/platform/leads` (et non `/api/platform/leads`).

### Modèle de données

- **Un seul lien lead → tenant** : `platform_leads.tenant_id` (unique), posé à l'invitation ; `converted_at` est posé à l'activation. Pas de `tenants.lead_id`, pas de `converted_tenant_id` : la table `tenants` n'est pas modifiée.
- Seul `status` est un enum Postgres (`lead_status`). `segment`, `kind`, `source`, `agency_ban_phase` et le type d'événement sont des chaînes validées par l'API (`schemas/platform_leads.py`) : ajouter un segment ne demande pas de migration.
- Segments ajoutés depuis la v1.0 : `childcare_sk`, `ltc_sk` (le fichier de leads couvre maintenant la Saskatchewan).
- `created_by` référence `users.id` (l'identifiant Clerk est une chaîne dans ce schéma) et est nullable pour les leads créés par le système (formulaire public).

### Machine à états

- Les cinq étapes ouvertes (`new` … `invited`) se parcourent **dans les deux sens** ; sauter une étape est permis.
- `won` n'est jamais posé à la main (422) et est terminal.
- `lost` exige `lost_reason` ; un lead perdu ne se rouvre que vers `contacted`, ce qui efface la raison (l'événement la conserve).

### Import

- Un ré-import **ne recule jamais un lead** : sur un lead existant, `status` et `lost_reason` ne sont jamais touchés ; `next_action`, `next_action_at` et `notes` ne sont remplis que s'ils sont vides ; seuls les champs descriptifs sont rafraîchis.
- Le résultat ajoute un compteur `unchanged`.
- « Canal » dans la colonne Vague → `wave` NULL. « ON » / « SK » dans la colonne Phase → `none`. « Recherche 2026-09 » → `source = research`, libellé conservé dans `source_detail`.
- Score et Vague sont des formules dans le classeur : l'import lit les valeurs en cache.
- Les statuts `won` et `lost` ne s'importent pas (ligne ignorée avec raison).
- Le fichier de référence compte **138 lignes** (101 dans la v1.0 de la spec), dont toujours 30 en vague A. Il est versionné dans `backend/app/tests/fixtures/`.

### Reste à faire

- **Session frontend** : onglet Leads, liste, fiche, i18n, option Marketing dans l'écran des opérateurs, redirection d'un compte marketing vers `/platform/leads`, export CSV.
- **Session conversion + intake** : `POST /{id}/invite` (owner ; demande de découper `TenantService.create_network`, qui commite et envoie le courriel lui-même), passage à `won` à l'activation du tenant, intake public. Le formulaire de kouamvision.com passe par une route serveur : prévoir un secret partagé et la transmission de l'IP du visiteur plutôt que du CORS.
