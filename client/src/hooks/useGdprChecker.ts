/**
 * useGdprChecker
 * Live GDPR name + PII detector for rapport text fields.
 * Usage:
 *   const { check, hits, isClean } = useGdprChecker();
 *   <Textarea onChange={(e) => check(e.target.value)} />
 *   {hits.length > 0 && <GdprWarning hits={hits} onReplace={...} />}
 */

import { useState, useCallback } from "react";

export interface GdprHit {
  word: string;
  type: "navn" | "fullt navn" | "mulig navn" | "fødselsdato" | "personnummer" | "telefon" | "e-post" | "adresse" | string;
  confidence?: "high" | "medium";
}

// ── NAME DATABASE ─────────────────────────────────────────────────────────────
const NO_NAMES = new Set([
  // Norwegian male
  "adam","aksel","alexander","aleksander","alfred","anders","andreas","arne","arnt",
  "arild","arvid","asbjørn","asgeir","asle","asmund","audun","august","atle","axel",
  "bjarne","bjørn","bjørnar","børge","christian","christoffer","dag","dagfinn","daniel",
  "david","edvard","egil","eilert","einar","eirik","endre","erling","espen","even",
  "eystein","filip","frank","frederik","fredrik","frode","geir","gjermund","gjert",
  "gunnar","guttorm","håkon","halvor","hans","harald","helge","henrik","herman",
  "ivar","jacob","jakob","jan","jarle","jens","joachim","johannes","john","jon",
  "jonas","jonathan","jostein","julius","karl","kjell","kjetil","knud","knut",
  "kolbjørn","kristian","kristoffer","lars","laurits","leif","liam","ludvig","lukas",
  "magnus","martin","mathias","mattis","max","mikael","mikkel","morten","nikolai",
  "noah","odd","olaf","olav","ole","oliver","oscar","oskar","øystein","øyvind",
  "pål","petter","philip","rasmus","reidar","robin","ruben","rune","sebastian",
  "sigmund","sigurd","sindre","sondre","stefan","stian","stig","svein","sveinung",
  "sven","teodor","thomas","thor","tim","tobias","tommy","tor","torbjørn","tord",
  "tore","torgeir","torkjel","tormod","torstein","trond","truls","ulrik","vegard",
  "vetle","victor","viggo","vidar","viljar","villem","william","yngve","elias",
  "felix","gabriel","hugo","isak","kasper","lasse","lauritz","mads","markus",
  "mathis","niels","niklas","nils","per","pieter","preben","rolf","roar",
  // Norwegian female
  "agnes","alexandra","alida","alina","alma","amalie","amanda","amelia","andrea",
  "anette","anita","ann","anna","anne","annette","annika","astrid","aurora","beate",
  "berit","birgit","birgitte","bodil","britta","camilla","carina","cecilie","charlotte",
  "christina","christine","dagmar","diana","dorthe","else","elise","elisabet",
  "elizabeth","ella","ellen","emilie","emma","eva","frida","frøya","gro","gudrun",
  "gunhild","gunnhild","gyda","hanna","hanne","hedda","heidi","helene","hilde","ida",
  "ina","inga","ingeborg","ingrid","irene","iris","jenny","johanna","julie","karen",
  "kari","karianne","karin","katarina","katrine","kirstin","kristin","kristina",
  "kristine","laila","lena","line","linn","lisbeth","lise","liv","lotte","louise",
  "luna","magnhild","maja","malene","malin","maren","maria","marie","marianne",
  "marte","mathilde","marit","miriam","mona","nathalie","nina","nora","olivia",
  "petra","ragnhild","randi","ranveig","reidun","renate","runa","ruth","sarah",
  "selma","sigrid","silje","siri","sissel","sofie","solveig","sonja","stine",
  "synne","thea","therese","tone","tonje","torill","tove","turid","tuva","unn",
  "unni","veronika","vibeke","vilde","wenche","ylva","åse","åsne",
  // International — common in Norway
  "aisha","aicha","alaa","ali","alinta","amina","amir","amira","anwar","aryan",
  "aziz","baran","fatima","habib","hamid","hamza","hassan","ibrahim","ismail",
  "karim","khalid","khadija","leila","leilani","maha","mahmoud","malik","mariam",
  "maryam","mehmet","mohamad","mohammad","mohammed","muhammed","nadia","naja",
  "nasrin","natasha","neha","noor","nour","omar","parveen","priya","priyanka",
  "rania","reza","rina","roshani","roxana","roya","sadia","salim","salma","samira",
  "sana","selena","shirin","shreya","tariq","yasmin","yusuf","zainab","zahra","zara",
  // English & other European
  "aaron","alex","alexis","amber","angela","ashley","austin","bella","benjamin",
  "brandon","brittany","cameron","charlie","chelsea","christopher","claire","crystal",
  "derek","dylan","emily","ethan","grace","hannah","jack","jackie","jake","james",
  "jason","jennifer","jessica","jordan","josh","joshua","julia","justin","karen",
  "kate","katie","kevin","kimberly","kyle","lauren","lisa","lucy","luke","mark",
  "matthew","melissa","michael","michelle","mike","morgan","natalie","nicholas",
  "nicole","patrick","paul","rachel","rebecca","ryan","samantha","samuel","sandra",
  "scott","sophie","stephen","steven","tiffany","tyler","victoria","wendy",
  // Eastern European
  "anastasia","andrei","daria","dmitri","elena","irina","ivan","katerina","katya",
  "kira","ksenia","nikolaj","nikolay","olga","oksana","sergei","tatiana","tatjana",
  "valentina","valeria","vera","vika","vlad","vladimir","yulia","yvette","yvonne",
  // African & Middle Eastern extras
  "adnan","dawit","farida","galina","kofi","layla","leyla","maya","nana","nelson",
  "orianna","said","said","taryn","temi","wanda","yara",
]);

// Words before which a capitalized word is likely a name
const NAME_TRIGGERS = new Set([
  "med","til","for","fra","hos","av","og","ringte","møtte","besøkte","snakket",
  "kontaktet","fulgte","hentet","brakte","hjalp","støttet","veiledet","informerte",
  "varslet","hilste","traff","så","kjente","møtet","besøket","samtale","kontakt",
  "samarbeid","pårørende","søster","bror","far","mor","foreldre","besteforeldre",
  "fosterforeldre","lærer","kontaktlærer","saksbehandler","lege","psykolog",
  "kollega","venn","venninne","nabo","morgen","ettermiddag","kveld",
]);

// Common Norwegian nouns/proper nouns that should NOT be flagged
const WHITELIST = new Set([
  "mandag","tirsdag","onsdag","torsdag","fredag","lørdag","søndag",
  "januar","februar","mars","april","mai","juni","juli","august",
  "september","oktober","november","desember",
  "nord","sør","øst","vest","norge","oslo","bergen","trondheim","stavanger",
  "tromsø","kristiansand","sandnes","drammen","fredrikstad","asker","lillestrøm",
  "hjem","skole","jobb","kontor","sentrum","park","nav","tidum",
  "god","bra","fint","stor","liten","ny","gammel","første","andre","tredje",
  "rapport","aktivitet","møte","tiltak","plan","mål","uke","måned","dag","time",
  "klient","bruker","ungdom","barn","person","brukeren","ungdommen",
  "aktivitør","miljøarbeider","tiltaksleder","sosialarbeider","miljøterapeut",
  "barnevernet","barnevern","frelsesarmeen","kirkens","norsk","norske",
  "adl","hverdagsmestring","økonomi","handling","innkjøp","matlaging",
  "veiledning","oppfølging","koordinering","dokumentasjon","ansvarsgruppe",
]);

const PII_PATTERNS: Array<{ regex: RegExp; label: GdprHit["type"] }> = [
  { regex: /\b\d{2}[./\-]\d{2}[./\-]\d{2,4}\b/g,                            label: "fødselsdato" },
  { regex: /\b\d{11}\b/g,                                                      label: "personnummer" },
  { regex: /(?:tlf|telefon|mobil|mob)\s*[:\-]?\s*[\d\s+]{8,}/gi,              label: "telefon" },
  { regex: /\b\d{4}\s+[A-ZÆØÅ][a-zæøå]+\b/g,                                 label: "adresse" },
  { regex: /\b[a-zæøå0-9._%+\-]+@[a-zæøå0-9.\-]+\.[a-z]{2,}\b/gi,           label: "e-post" },
  { regex: /\b[A-ZÆØÅ][a-zæøå]+(gata|veien|vegen|stien|allé|vei|gate|sti|plass)\s*\d*/g, label: "adresse" },
];

function detectFullNames(text: string): GdprHit[] {
  const found: GdprHit[] = [];
  const regex = /\b([A-ZÆØÅ][a-zæøå]{1,})\s+([A-ZÆØÅ][a-zæøå]{1,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const l1 = m[1].toLowerCase(), l2 = m[2].toLowerCase();
    if ((NO_NAMES.has(l1) || NO_NAMES.has(l2)) && !WHITELIST.has(l1) && !WHITELIST.has(l2)) {
      found.push({ word: m[0], type: "fullt navn", confidence: "high" });
    }
  }
  return found;
}

function detectKnownNames(text: string): GdprHit[] {
  const found: GdprHit[] = [];
  const wordRe = /\b([A-ZÆØÅ][a-zæøå]{1,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    const lower = m[1].toLowerCase();
    if (!WHITELIST.has(lower) && NO_NAMES.has(lower)) {
      found.push({ word: m[1], type: "navn", confidence: "high" });
    }
  }
  return found;
}

function detectByContext(text: string): GdprHit[] {
  const found: GdprHit[] = [];
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const trigger = words[i].toLowerCase().replace(/[,.:;!?]$/, "");
    if (NAME_TRIGGERS.has(trigger)) {
      const next = words[i + 1].replace(/[,.:;!?]$/, "");
      if (/^[A-ZÆØÅ][a-zæøå]{2,}$/.test(next) && !WHITELIST.has(next.toLowerCase())) {
        found.push({ word: next, type: "mulig navn", confidence: "high" });
      }
    }
  }
  return found;
}

function detectPII(text: string): GdprHit[] {
  const found: GdprHit[] = [];
  PII_PATTERNS.forEach(({ regex, label }) => {
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ word: m[0], type: label });
    }
  });
  return found;
}

function dedupHits(hits: GdprHit[]): GdprHit[] {
  const seen = new Set<string>();
  return hits.filter(h => {
    const key = h.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function runGdprCheck(text: string): GdprHit[] {
  if (!text.trim()) return [];
  const fullNames  = detectFullNames(text);
  const fullWords  = new Set(fullNames.flatMap(f => f.word.toLowerCase().split(" ")));
  const known      = detectKnownNames(text).filter(h => !fullWords.has(h.word.toLowerCase()));
  const byContext  = detectByContext(text).filter(h => !fullWords.has(h.word.toLowerCase()));
  const pii        = detectPII(text);
  return dedupHits([...fullNames, ...known, ...byContext, ...pii]);
}

export const ANONYMOUS_SUGGESTIONS = [
  "ungdommen", "jenta", "gutten", "brukeren", "vedkommende",
  "den unge", "personen", "barnet", "klienten", "deltakeren",
  "den voksne", "ungdommet",
] as const;

// ── HOOK ──────────────────────────────────────────────────────────────────────
export function useGdprChecker() {
  const [hits, setHits] = useState<GdprHit[]>([]);

  const check = useCallback((text: string) => {
    setHits(runGdprCheck(text));
  }, []);

  const replaceFirst = useCallback(
    (text: string, replacement: string): string => {
      const allHits = runGdprCheck(text);
      if (!allHits.length) return text;
      // Full names first, then single names
      const target = allHits.find(h => h.type === "fullt navn") ?? allHits[0];
      const updated = text.replace(target.word, replacement);
      setHits(runGdprCheck(updated));
      return updated;
    },
    []
  );

  /**
   * Auto-replace all detected names/PII with anonymous terms.
   * Uses a deterministic mapping so the same name always gets the same replacement.
   */
  const autoReplaceAll = useCallback(
    (text: string): string => {
      const allHits = runGdprCheck(text);
      if (!allHits.length) return text;
      // Build stable mapping: each unique name gets a unique anonymous term
      const nameHits = allHits.filter(h => ["navn", "fullt navn", "mulig navn"].includes(h.type));
      const map = new Map<string, string>();
      let idx = 0;
      for (const h of nameHits) {
        const key = h.word.toLowerCase();
        if (!map.has(key)) {
          map.set(key, ANONYMOUS_SUGGESTIONS[idx % ANONYMOUS_SUGGESTIONS.length]);
          idx++;
        }
      }
      let result = text;
      // Replace longest matches first (full names before single names)
      const sorted = Array.from(map.entries()).sort((a, b) => b[0].length - a[0].length);
      for (const [name, replacement] of sorted) {
        result = result.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replacement);
      }
      setHits(runGdprCheck(result));
      return result;
    },
    []
  );

  return {
    hits,
    isClean: hits.length === 0,
    check,
    replaceFirst,
    autoReplaceAll,
  };
}
