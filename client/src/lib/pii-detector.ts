/**
 * PII (Personally Identifiable Information) Detection Utility — v2 Smart
 * 
 * Context-aware scanner for Norwegian social work reports.
 * Detects names, birthdates, addresses, phone numbers, emails, SSNs,
 * family relationship patterns, and full-name combinations.
 * 
 * Uses Norwegian social work phrase patterns to detect names even when
 * they're not in the dictionary (e.g., "Møte med Aryan om..." catches
 * "Aryan" as a likely name because it follows "møte med").
 * 
 * Suggests anonymous alternatives: gutten, jenta, brukeren, ungdom, etc.
 */

export interface PiiWarning {
  /** The detected text that may be PII */
  match: string;
  /** Type of PII detected */
  type: 'name' | 'full_name' | 'date' | 'address' | 'phone' | 'email' | 'ssn' | 'relationship' | 'location';
  /** Human-readable description of the warning (Norwegian) */
  message: string;
  /** Suggested replacement text */
  suggestion: string;
  /** Character offset in the plain text */
  offset: number;
  /** Confidence: how likely this is actual PII */
  confidence: 'high' | 'medium' | 'low';
}

export interface PiiScanResult {
  /** Whether any PII was detected */
  hasPii: boolean;
  /** Array of all detected PII warnings */
  warnings: PiiWarning[];
  /** Count by type */
  counts: Record<string, number>;
  /** Highest confidence level found */
  maxConfidence: 'high' | 'medium' | 'low' | 'none';
}

// ─── Common Norwegian first names ───
const NORWEGIAN_MALE_NAMES = [
  'jan','per','bjørn','ole','lars','kjell','arne','knut','svein','thomas',
  'hans','geir','tor','morten','terje','odd','erik','martin','andreas','john',
  'karl','rune','trond','jon','arild','harald','magnus','stefan','einar','øyvind',
  'helge','roy','dag','gunnar','leif','frode','espen','stian','steinar','roger',
  'øystein','eirik','henrik','rolf','kristian','jostein','ivar','tore','petter',
  'olav','nils','stig','vidar','tommy','alexander','christian','daniel','fredrik',
  'simen','tobias','mathias','jonas','kristoffer','sindre','vegard','håkon','jørgen',
  'anders','markus','nikolai','sebastian','adrian','even','gaute','torbjørn','sigurd',
  'amund','erlend','halvard','pål','snorre','sverre','trygve','yngve','ulf','birger',
  'aksel','tarjei','vetle','herman','edvard','halvor','asbjørn','brage','didrik',
  'filip','kasper','ludvig','oskar','william','noah','oliver','jakob','elias','isak',
  'emil','liam','leon','theo','lucas','hugo','felix','oscar','adam','benjamin',
  'mohammed','muhammad','ahmed','ali','hussein','omar','hassan','ibrahim','hamza',
  'yusuf','david','michael','joseph','james','robert','richard',
  'charles','george','kevin','brian','patrick','mark','peter','paul','steven',
  'abdi','abdullahi','abdirahman','mahad','samir','tariq','khalid','bilal','imran',
  'aryan','arian','amir','reza','navid','dariush','farhad','arash','kian','parsa',
  'minh','duc','tuan','hung','thai','vinh','nam','phong','hieu',
  'wei','chen','li','wang','zhang','liu','yang','huang',
  'jayden','aiden','logan','mason','ethan','ryan','dylan','connor',
];

const NORWEGIAN_FEMALE_NAMES = [
  'anna','anne','inger','kari','marit','ingrid','liv','eva','ida','berit',
  'astrid','bjørg','randi','solveig','hilde','marianne','ellen','kristin','silje',
  'elisabeth','nina','heidi','gerd','monica','hanne','bente','tone','marie',
  'camilla','lene','trine','anita','wenche','turid','ruth','else',
  'laila','mette','kirsten','gunn','unni','torill','rigmor','siri','grete',
  'ragnhild','sigrid','helen','stine','maria','therese','julie','marte','emilie',
  'nora','emma','sara','sofie','thea','amalie','linnea','leah','aurora',
  'vilde','frida','martine','andrine','katrine','maren','tuva','hedda','tiril',
  'oda','synne','selma','jenny','karoline','elise','maja','olivia','ella',
  'ingeborg','johanne','mathilde','alma','agnes','petra','eline','andrea',
  'fatima','aisha','amina','mariam','yasmin','leila','nadia','samira',
  'sofia','maryam','khadija','zahra','hawa','sumaya','ayan','hodan','asma',
  'linh','thi','huong','mai','lan','nga','hoa','thao',
  'mei','xiao','ying','fang','jing','min','hui',
  'priya','ananya','diya','anika','isha','kavya','riya',
  'chloe','sophie','mia','zoe','lily','grace','ruby','poppy',
];

// ─── Common Norwegian surnames ───
const NORWEGIAN_SURNAMES = [
  'hansen','johansen','olsen','larsen','andersen','pedersen','nilsen','kristiansen',
  'jensen','karlsen','johnsen','pettersen','eriksen','berg','haugen','hagen','johannessen',
  'andreassen','jacobsen','dahl','jørgensen','halvorsen','henriksen','lund','sørensen',
  'jakobsen','moen','gundersen','iversen','strand','solberg','svendsen','danielsen',
  'berge','knutsen','fredriksen','bakken','christensen','lie','amundsen','nguyen',
  'holm','martinsen','aasen','thorsen','ellingsen','ruud','bøe','eide','nygård',
  'madsen','moe','bakke','aas','tveit','brekke','vik','lien','tangen',
  'ali','ahmed','hussein','mohamed','khan','singh','patel','sharma','kumar',
  'nguyen','tran','le','pham','hoang','do','bui','dang','ngo',
];

const ALL_NAMES = new Set<string>([
  ...NORWEGIAN_MALE_NAMES,
  ...NORWEGIAN_FEMALE_NAMES,
]);

const ALL_SURNAMES = new Set<string>(NORWEGIAN_SURNAMES);

// Words that look like names but should NOT trigger warnings
const SAFE_WORDS = new Set<string>([
  // Prepositions, pronouns, common short words
  'sin','per','over','under','til','fra','ved','for','med','mot',
  'den','det','han','hun','hen','dem','seg','som','kan','har',
  'vil','bli','var','men','dag','tid','liv','tur','ble','min',
  'din','vår','alle','noen','andre','hele','mange','bare','også',
  'etter','mellom','gjennom','rundt','langs','siden','slik','både',
  'dette','disse','denne','mitt','ditt','hans','hennes','deres',
  // Allowed anonymous references
  'gutten','jenta','brukeren','deltakeren','klienten','personen',
  'ungdom','ungdommen','barnet','eleven','pasienten','beboeren',
  'foreldrene','foresatte','familien','søsken','venner','læreren',
  'kontaktpersonen','saksbehandler','rådgiver','veileder','terapeut',
  // Common nouns that might match name patterns
  'may','møte','møter','møtet','tak','mark','rose','mars','sol',
  'tone','toner','tonet','august','april','juni','juli','villa',
  'berg','lund','vik','strand','moen','lie','ås','dal','bakke','holm',
  'land','nord','sør','øst','vest','stor','lang','kort','mye','lite',
  'adam','eva',  // Biblical in context
  // Report-specific vocabulary
  'tiltak','vedtak','rapport','plan','mål','aktivitet','oppfølging',
  'samtale','observasjon','kartlegging','evaluering','vurdering',
  'utvikling','fremgang','utfordring','mestring','fungering',
  'skole','hjem','fritid','arbeid','trening','behandling',
  'miljøarbeider','sosialarbeider','koordinator','konsulent',
  'barnevern','nav','bup','ppt','helsestasjon','fastlege',
]);

// ─── CONTEXTUAL PHRASE PATTERNS ───
// Norwegian social work phrases where a name typically follows
// These catch names even if they're NOT in the name dictionary
const NAME_TRIGGER_PHRASES = [
  // Meeting/contact patterns
  /\b(?:møte|møtt|møttes|samtale|oppfølging|kontakt)\s+med\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  /\b(?:snakket|pratet|diskuterte|drøftet)\s+med\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  /\b(?:ringte|sendte|kontaktet|informerte|varslet)\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  // Activity patterns
  /\b(?:hentet|kjørte|fulgte|leverte|besøkte|hjalp)\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  /\b(?:observerte|kartla|vurderte|evaluerte)\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  // Relational patterns — "hos [Name]", "til [Name]", "for [Name]"
  /\bhos\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  /\bbesøk\s+(?:hos|til)\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  // "[Name] var/er/ble/har"
  /\b([A-ZÆØÅ][a-zæøå]{2,})\s+(?:var|er|ble|har|hadde|ville|skal|kan|bør|må|trenger|ønsker|nekter|virker|ser ut|forteller|sier|mener|opplever)\b/g,
  // "[Name] sin/sitt/sine"
  /\b([A-ZÆØÅ][a-zæøå]{2,})\s+(?:sin|sitt|sine|hans|hennes)\b/g,
  // "sammen med [Name]"
  /\bsammen\s+med\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
  // "[Name] og [Name]"  — two names connected by "og"
  /\b([A-ZÆØÅ][a-zæøå]{2,})\s+og\s+([A-ZÆØÅ][a-zæøå]{2,})\b/g,
];

// ─── RELATIONSHIP PATTERNS ───
// Patterns like "moren til X", "X sin far", family references with names
const RELATIONSHIP_PATTERNS = [
  // "moren/faren/søsteren/broren til [Name]"
  /\b(?:mor(?:en)?|far(?:en)?|søster(?:en)?|bror(?:en)?|bestemor(?:en)?|bestefar(?:en)?|tante(?:n)?|onkel(?:en)?|kusine(?:n)?|fetter(?:en)?)\s+til\s+([A-ZÆØÅ][a-zæøå]{2,})\b/gi,
  // "[Name] sin mor/far/søster"
  /\b([A-ZÆØÅ][a-zæøå]{2,})\s+sin\s+(?:mor|far|søster|bror|bestemor|bestefar|tante|onkel|familie)\b/gi,
  // "[Name]s mor/far" (genitive s)
  /\b([A-ZÆØÅ][a-zæøå]{2,})s\s+(?:mor|far|søster|bror|bestemor|bestefar|tante|onkel|familie|foreldre|foresatte|hjem)\b/gi,
  // "familien [Surname]"
  /\bfamilien\s+([A-ZÆØÅ][a-zæøå]{2,})\b/gi,
];

// ─── FULL NAME PATTERN ───
// Two or more consecutive capitalized words (likely a full name)
const FULL_NAME_PATTERN = /\b([A-ZÆØÅ][a-zæøå]{2,})\s+([A-ZÆØÅ][a-zæøå]{2,})(?:\s+([A-ZÆØÅ][a-zæøå]{2,}))?\b/g;

// ─── IDENTIFIABLE LOCATION PATTERNS ───
// Specific schools, institutions, neighborhoods that could identify a person
const LOCATION_PATTERNS = [
  // "[Name] skole/barnehage/ungdomsskole"
  /\b([A-ZÆØÅ][a-zæøå]+)\s+(?:skole|barneskole|ungdomsskole|videregående|barnehage|SFO|AKS)\b/gi,
  // Specific Norwegian neighborhoods (Oslo etc.)
  /\b(?:Grünerløkka|Tøyen|Grønland|Gamle\s+Oslo|Sagene|St\.?\s*Hanshaugen|Frogner|Majorstuen|Bislett|Torshov|Bjølsen|Stovner|Grorud|Alna|Bjerke|Søndre\s+Nordstrand|Holmlia|Mortensrud|Furuset|Ellingsrud|Manglerud|Ekeberg|Bekkelaget|Nordstrand|Lambertseter|Oppsal|Bøler|Tveita|Helsfyr)\b/g,
];

// Norwegian street/address keywords
const ADDRESS_PATTERNS = [
  /\b\d{1,3}\s*[a-zæøå]?\s*,?\s*\d{4}\s+[A-ZÆØÅ][a-zæøå]+/g,
  /\b(?:gate|gata|vei|veien|allé|alleen|plass|plassen|terrasse|torg|torget)\s+\d+/gi,
  /\b\d+\s*(?:gate|gata|vei|veien|allé|alleen|plass|plassen|terrasse|torg|torget)\b/gi,
  /\b[A-ZÆØÅ][a-zæøå]+(?:gate|gata|vei|veien|allé|alleen)\s*\d+\s*[a-zæøå]?\b/g,
  // Postal code + city
  /\b\d{4}\s+[A-ZÆØÅ][a-zæøå]+\b/g,
];

// Date patterns (birthdates)
const DATE_PATTERNS = [
  /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/g,
  /\b(\d{1,2})\.\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})\b/gi,
  /\bfødt\s+(?:i\s+)?(\d{4})\b/gi,
  /\b(\d{1,2})\s+år(?:\s+gammel)?\b/gi,
  // "born in [year]"
  /\bfødt\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/gi,
];

const PHONE_PATTERNS = [
  /\b(?:\+47\s?)?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\b/g,
  /\b(?:\+47)?\d{8}\b/g,
];

const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const SSN_PATTERN = /\b\d{6}\s?\d{5}\b/g;

// ─── Helper Functions ───

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeWord(word: string): boolean {
  return SAFE_WORDS.has(word.toLowerCase());
}

function isKnownName(word: string): boolean {
  const lower = word.toLowerCase();
  if (lower.length < 3) return false;
  if (isSafeWord(word)) return false;
  return ALL_NAMES.has(lower);
}

function isKnownSurname(word: string): boolean {
  return ALL_SURNAMES.has(word.toLowerCase());
}

/** Get a context-aware replacement suggestion based on the trigger phrase */
function getContextualSuggestion(precedingText: string): string {
  const lower = precedingText.toLowerCase();
  if (/møte|samtale|snakket|pratet/.test(lower)) {
    return 'Erstatt navnet med «brukeren» eller «ungdommen» — f.eks. «møte med brukeren»';
  }
  if (/hentet|kjørte|fulgte|leverte/.test(lower)) {
    return 'Erstatt navnet med «ungdommen» eller «brukeren» — f.eks. «hentet ungdommen»';
  }
  if (/besøk|hos/.test(lower)) {
    return 'Erstatt med «hjemmebesøk hos brukeren» eller «besøk i hjemmet»';
  }
  if (/ringte|kontaktet|informerte/.test(lower)) {
    return 'Erstatt navnet med «foresatte», «kontaktperson» eller «brukeren»';
  }
  if (/sammen med/.test(lower)) {
    return 'Erstatt med «sammen med brukeren» eller «sammen med ungdommen»';
  }
  return 'Bruk «gutten», «jenta», «brukeren», «ungdom» eller «klienten» i stedet';
}

// ─── Main Scan Function ───

export function scanForPii(text: string): PiiScanResult {
  if (!text || text.trim().length === 0) {
    return { hasPii: false, warnings: [], counts: {}, maxConfidence: 'none' };
  }

  const plainText = stripHtml(text);
  const warnings: PiiWarning[] = [];

  // ── 1. Dictionary name scan (word-by-word) ──
  const words = plainText.split(/\s+/);
  let currentOffset = 0;
  
  for (const word of words) {
    const cleaned = word.replace(/[.,;:!?"'()[\]{}]/g, '');
    
    if (isKnownName(cleaned)) {
      warnings.push({
        match: cleaned,
        type: 'name',
        message: `Personnavn oppdaget: «${cleaned}»`,
        suggestion: 'Bruk «gutten», «jenta», «brukeren», «ungdom» eller «klienten» i stedet',
        offset: currentOffset,
        confidence: 'high',
      });
    }
    currentOffset += word.length + 1;
  }

  // ── 2. Contextual phrase detection (catches names NOT in dictionary) ──
  for (const pattern of NAME_TRIGGER_PHRASES) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      // Extract captured name(s) (group 1 and optionally group 2 for "X og Y")
      const capturedNames = [match[1], match[2]].filter(Boolean);
      
      for (const name of capturedNames) {
        if (!name || isSafeWord(name)) continue;
        
        // Already caught by dictionary scan?
        const alreadyCaught = warnings.some(
          w => w.match.toLowerCase() === name.toLowerCase() && Math.abs(w.offset - match!.index) < 30
        );
        if (alreadyCaught) continue;

        // Get surrounding context for smart suggestion
        const precedingText = plainText.slice(Math.max(0, match.index - 30), match.index + match[0].indexOf(name));
        
        warnings.push({
          match: name,
          type: 'name',
          message: `Mulig personnavn i kontekst: «${match[0].trim()}»`,
          suggestion: getContextualSuggestion(precedingText),
          offset: match.index,
          confidence: isKnownName(name) ? 'high' : 'medium',
        });
      }
    }
  }

  // ── 3. Full name detection (two+ consecutive capitalized words) ──
  {
    const regex = new RegExp(FULL_NAME_PATTERN.source, FULL_NAME_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const firstName = match[1];
      const secondWord = match[2];
      const thirdWord = match[3];

      if (isSafeWord(firstName) && isSafeWord(secondWord)) continue;

      // Strong signal: first word is known name OR second word is known surname
      const firstIsName = isKnownName(firstName);
      const secondIsSurname = isKnownSurname(secondWord);
      const secondIsName = isKnownName(secondWord);

      // Skip if both words are safe/common nouns (e.g. "Sosial Utvikling")
      if (!firstIsName && !secondIsSurname && !secondIsName) continue;

      const fullName = thirdWord ? `${firstName} ${secondWord} ${thirdWord}` : `${firstName} ${secondWord}`;
      
      // Already caught?
      const alreadyCaught = warnings.some(
        w => w.match.toLowerCase() === firstName.toLowerCase() && Math.abs(w.offset - match!.index) < 5
      );
      if (alreadyCaught) {
        // Upgrade existing warning to full_name with the full match
        const existing = warnings.find(
          w => w.match.toLowerCase() === firstName.toLowerCase() && Math.abs(w.offset - match!.index) < 5
        );
        if (existing) {
          existing.match = fullName;
          existing.type = 'full_name';
          existing.message = `Fullt navn oppdaget: «${fullName}»`;
          existing.confidence = 'high';
        }
        continue;
      }

      warnings.push({
        match: fullName,
        type: 'full_name',
        message: `Fullt navn oppdaget: «${fullName}»`,
        suggestion: 'Fjern hele navnet. Bruk «brukeren», «ungdommen» eller «klienten» i stedet',
        offset: match.index,
        confidence: (firstIsName && secondIsSurname) ? 'high' : 'medium',
      });
    }
  }

  // ── 4. Relationship patterns ──
  for (const pattern of RELATIONSHIP_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const name = match[1];
      if (!name || isSafeWord(name)) continue;

      const alreadyCaught = warnings.some(
        w => w.match.toLowerCase() === name.toLowerCase() && Math.abs(w.offset - match!.index) < 30
      );

      warnings.push({
        match: match[0],
        type: 'relationship',
        message: `Familierelasjon med navn: «${match[0]}»`,
        suggestion: 'Bruk «foresatte», «mor til brukeren», «brukerens far» osv. uten navn',
        offset: match.index,
        confidence: 'high',
        ...(alreadyCaught ? {} : {}), // still add — the relationship context is important
      });
    }
  }

  // ── 5. Identifiable locations ──
  for (const pattern of LOCATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const fullMatch = match[0];
      // Skip if it's a generic term
      if (/^(en|et|den|det|denne|dette)\s/i.test(fullMatch)) continue;
      
      warnings.push({
        match: fullMatch,
        type: 'location',
        message: `Identifiserbart sted: «${fullMatch}»`,
        suggestion: 'Bruk generelle termer som «skolen», «barnehagen», «i nærmiljøet» eller «bydelen»',
        offset: match.index,
        confidence: 'medium',
      });
    }
  }

  // ── 6. Dates/birthdates ──
  for (const pattern of DATE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const fullMatch = match[0];
      
      if (/\d+\s+år/i.test(fullMatch)) {
        warnings.push({
          match: fullMatch,
          type: 'date',
          message: `Eksakt alder: «${fullMatch}»`,
          suggestion: 'Bruk aldersgruppe: «ungdom», «ung person», «tenåring», «voksen»',
          offset: match.index,
          confidence: 'high',
        });
      } else {
        warnings.push({
          match: fullMatch,
          type: 'date',
          message: `Mulig fødselsdato: «${fullMatch}»`,
          suggestion: 'Fjern datoen eller bruk aldersgruppe som «ungdom» eller «voksen»',
          offset: match.index,
          confidence: 'medium',
        });
      }
    }
  }

  // ── 7. Addresses ──
  for (const pattern of ADDRESS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      warnings.push({
        match: match[0],
        type: 'address',
        message: `Mulig adresse: «${match[0]}»`,
        suggestion: 'Bruk «hjemme», «på skolen», «i nærmiljøet», «i bydelen»',
        offset: match.index,
        confidence: 'medium',
      });
    }
  }

  // ── 8. Phone numbers ──
  for (const pattern of PHONE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      if (/SAK|REF|NR/i.test(plainText.slice(Math.max(0, match.index - 10), match.index))) continue;
      warnings.push({
        match: match[0],
        type: 'phone',
        message: `Telefonnummer: «${match[0]}»`,
        suggestion: 'Fjern telefonnummeret fra rapporten',
        offset: match.index,
        confidence: 'high',
      });
    }
  }

  // ── 9. Emails ──
  {
    const regex = new RegExp(EMAIL_PATTERN.source, EMAIL_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      warnings.push({
        match: match[0],
        type: 'email',
        message: `E-postadresse: «${match[0]}»`,
        suggestion: 'Fjern e-postadressen fra rapporten',
        offset: match.index,
        confidence: 'high',
      });
    }
  }

  // ── 10. Norwegian SSN (fødselsnummer) ──
  {
    const regex = new RegExp(SSN_PATTERN.source, SSN_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(plainText)) !== null) {
      const digits = match[0].replace(/\s/g, '');
      if (digits.length === 11) {
        warnings.push({
          match: match[0],
          type: 'ssn',
          message: `Fødselsnummer oppdaget — svært sensitiv informasjon`,
          suggestion: 'Fjern fødselsnummeret UMIDDELBART',
          offset: match.index,
          confidence: 'high',
        });
      }
    }
  }

  const deduped = deduplicateWarnings(warnings);

  const counts: Record<string, number> = {};
  let maxConfidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  for (const w of deduped) {
    counts[w.type] = (counts[w.type] || 0) + 1;
    if (w.confidence === 'high') maxConfidence = 'high';
    else if (w.confidence === 'medium' && maxConfidence !== 'high') maxConfidence = 'medium';
    else if (w.confidence === 'low' && maxConfidence === 'none') maxConfidence = 'low';
  }

  return {
    hasPii: deduped.length > 0,
    warnings: deduped,
    counts,
    maxConfidence,
  };
}

/**
 * Scan multiple text fields and return combined results
 */
export function scanMultipleFields(
  fields: Record<string, string>
): { results: Record<string, PiiScanResult>; totalWarnings: number; hasPii: boolean } {
  const results: Record<string, PiiScanResult> = {};
  let totalWarnings = 0;
  let hasPii = false;

  for (const [fieldName, text] of Object.entries(fields)) {
    const result = scanForPii(text);
    results[fieldName] = result;
    totalWarnings += result.warnings.length;
    if (result.hasPii) hasPii = true;
  }

  return { results, totalWarnings, hasPii };
}

function deduplicateWarnings(warnings: PiiWarning[]): PiiWarning[] {
  const seen = new Map<string, PiiWarning>();
  
  for (const w of warnings) {
    const key = `${w.type}:${w.match.toLowerCase()}:${Math.floor(w.offset / 10)}`;
    if (!seen.has(key)) {
      seen.set(key, w);
    } else {
      // Keep the higher-confidence one
      const existing = seen.get(key)!;
      const confOrder = { high: 3, medium: 2, low: 1 };
      if (confOrder[w.confidence] > confOrder[existing.confidence]) {
        seen.set(key, w);
      }
    }
  }
  
  return Array.from(seen.values());
}

export const ANONYMOUS_ALTERNATIVES = {
  general: ['gutten', 'jenta', 'brukeren', 'deltakeren', 'klienten', 'personen'],
  ageGroups: ['ung person', 'ungdom', 'ungdommen', 'tenåring', 'voksen', 'barnet'],
  roles: ['eleven', 'pasienten', 'beboeren'],
  family: ['foresatte', 'foreldrene', 'mor til brukeren', 'far til brukeren', 'søsken'],
  locations: ['skolen', 'barnehagen', 'hjemmet', 'i nærmiljøet', 'i bydelen', 'på aktiviteten'],
} as const;

export function getPiiSeverity(type: PiiWarning['type']): 'critical' | 'high' | 'medium' {
  switch (type) {
    case 'ssn': return 'critical';
    case 'full_name': return 'critical';
    case 'name': case 'email': case 'phone': case 'relationship': return 'high';
    case 'date': case 'address': case 'location': return 'medium';
    default: return 'medium';
  }
}

export function getPiiTypeLabel(type: PiiWarning['type']): string {
  switch (type) {
    case 'name': return 'Personnavn';
    case 'full_name': return 'Fullt navn';
    case 'date': return 'Dato/Alder';
    case 'address': return 'Adresse';
    case 'phone': return 'Telefonnummer';
    case 'email': return 'E-post';
    case 'ssn': return 'Fødselsnummer';
    case 'relationship': return 'Familierelasjon';
    case 'location': return 'Identifiserbart sted';
    default: return 'Personopplysning';
  }
}

/** Get a confidence label in Norwegian — domain-appropriate severity language */
export function getConfidenceLabel(confidence: PiiWarning['confidence']): string {
  switch (confidence) {
    case 'high': return 'Kritisk';
    case 'medium': return 'Gjennomgå';
    case 'low': return 'Til info';
    default: return '';
  }
}
