import type { Dict } from './en'

/** German. "Du" throughout — the register the extension's own UI uses. */
export const de: Dict = {
  nav: {
    sections: 'Abschnitte',
    screenshots: 'Screenshots',
    howItWorks: "So geht's",
    features: 'Funktionen',
    privacy: 'Datenschutz',
    comparison: 'Vergleich',
    sourceOnGitHub: 'Quellcode auf GitHub',
    home: 'X-Pat — Startseite',
  },

  language: {
    label: 'Sprache',
    choose: 'Sprache wählen',
  },

  install: {
    chrome: 'Zu Chrome hinzufügen',
    edge: 'Zu Edge hinzufügen',
    brave: 'Zu Brave hinzufügen',
  },

  hero: {
    titleLead: 'Sieh, wo ein X-Profil',
    titleAccent: 'wirklich herkommt',
    lead: 'X weiß, aus welchem Land ein Konto postet. Es zeigt es dir nur nicht. Diese Erweiterung packt die Flagge in die Hover-Karte, und du kannst Länder ausblenden oder einklappen, die du nicht lesen willst.',
    seeItRunning: 'In Aktion sehen',
    railWorksIn: 'Läuft in',
    railAndroid: 'Auf Android',
    railAccount: 'Konto / API-Key',
    railAccountValue: 'Weder noch',
    railVersion: 'Version',
    panelFollowing: 'Folgt',
    panelFollowers: 'Follower',
    panelHidden: '🚫 Ausgeblendet · 🇮🇳 Indien',
    panelShow: 'Anzeigen',
  },

  screenshots: {
    heading: 'So sieht das aus, mitten in X.',
    lead: "Screenshots aus einer normalen Timeline. Klick einen an, um zu sehen, wie's läuft.",
    fullSize: 'Volle Größe',
    viewer: 'Screenshot-Ansicht',
    close: 'Schließen',
    prev: 'Vorheriges Bild',
    next: 'Nächstes Bild',
    railLabel: 'Screenshots',
    shots: {
      hover: {
        label: 'Flagge beim Hovern',
        alt: 'Eine X-Hover-Karte mit deutscher Flagge und „Deutschland“ unter dem Handle',
      },
      vpn: {
        label: 'VPN-Warnung',
        alt: 'Eine Hover-Karte mit US-Flagge und rotem ⚠ VPN-Badge',
      },
      feed: {
        label: 'Flaggen in der Timeline',
        alt: 'Eine Timeline, in der jeder Autor seine Landesflagge direkt in der Zeile trägt, ohne Hovern',
      },
      blocked: {
        label: 'Im Feed ausgeblendet',
        alt: 'Eine Timeline, in der ein Beitrag hinter einer Leiste „🚫 Ausgeblendet · Ägypten“ und einer Anzeigen-Schaltfläche eingeklappt ist',
      },
      keyword: {
        label: 'Stichwort-Hervorhebung',
        alt: 'Ein Tweet bernsteinfarben markiert, weil die Bio des Autors ein gespeichertes Stichwort enthält',
      },
      flagBios: {
        label: 'Mit Flaggen vollgestopfte Bios',
        alt: 'Ein Konto, das markiert wurde, weil es mehrere Landesflaggen in die Bio stopft',
      },
      swipe: {
        label: 'Wischen auf dem Handy',
        alt: 'Eine handybreite Timeline: nach rechts wischen blendet das Land des Autors als Overlay ein',
      },
    },
  },

  howItWorks: {
    heading: 'Wo die Flagge wirklich herkommt',
    lead: 'Zu jedem Konto auf X ist ein Land hinterlegt. X versteckt es in einem Menü, das kaum jemand aufmacht. Hier wird nichts über eine IP-Adresse geraten und keine externe Datenbank befragt.',
    steps: {
      hover: {
        title: 'Du hoverst ein Profil',
        body: 'Oder wischst einen Tweet nach rechts, am Handy. Keine Einstellungen nötig; die Abfrage passiert genau da, wo dein Cursor sowieso ist.',
        readoutKey: 'Auslöser',
        readoutValue: 'Hover · Wischen · Timeline',
      },
      ask: {
        title: 'Dein Browser fragt X direkt',
        body: 'Er nutzt die Session, die in deinem Browser liegt, für genau die gleiche Anfrage, die auch die Website stellt. Nichts von uns sitzt dazwischen.',
        readoutKey: 'Endpunkt',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Die Flagge landet in der Karte',
        body:
          "Dein Browser merkt sich die Antwort 30 Tage — der zweite Blick kostet nichts. Auf der Optionsseite gibt's " +
          'einen Knopf, der alles löscht.',
        readoutKey: 'Cache',
        readoutValue: 'lokal · 30 Tage',
      },
    },
  },

  rateBudget: {
    link: 'Wie das Budget funktioniert',
    heading: "X' Ratenlimit — gelöst, nicht gerissen.",
    lead: 'Du kennst das Bild: Oben im Thread füllt sich noch was, dann kommt nichts mehr. Das ist das Limit: fünfzig Abfragen alle fünfzehn Minuten, und ein lebhafter Thread hat mehr Accounts.',
    body: 'Die meisten Profile hier kosten gar keine Abfrage. Sie sind schon im Cache, oder jemand anderes hat sie nachgeschlagen und der geteilte Cache liefert die Antwort. Der Rest wird eingeteilt.',
    closing:
      "Falls du's doch leerfährst, kriegst du einen Countdown statt einer leeren Flagge. Anteil und Takt kannst du beides ändern.",
    facts: {
      real: {
        title: 'Die echte Zahl',
        body: "Das Budget kommt aus X' eigenen Antwort-Headern, nicht aus einer Schätzung, die beim Build festgezurrt wurde. Deine Hovers zählen auch mit rein.",
        readoutKey: 'Quelle',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Verteilt, nicht gesprintet',
        body: 'Etwa eine Abfrage alle 22 Sekunden, jedes Mal neu berechnet — dehnt sich, wenn du viel hoverst, und zieht sich zusammen, wenn das Fenster wieder voll ist.',
        readoutKey: 'Takt',
        readoutValue: 'Fenster ÷ Budget',
      },
      hovers: {
        title: 'Hovers gehen immer vor',
        body: 'Hintergrundarbeit stoppt bei 80 %, damit der Rest des Fensters für die Konten bleibt, auf die du wirklich zeigst.',
        readoutKey: 'Reserviert',
        readoutValue: '10 von 50',
      },
    },
    bar: {
      caption: 'Ein 15-Minuten-Fenster',
      alt: 'Fünfzig Abfragen pro Fenster: vierzig für Hintergrund-Vorabladen, zehn reserviert für deine Hovers.',
      backgroundNote: 'Hintergrund, über die vollen fünfzehn Minuten verteilt',
      reservedNote:
        'zurückgehalten, damit kein Hover je die Abfrage ist, die dich leerlaufen lässt',
    },
  },

  features: {
    heading: 'Eine Zeile Info — und was du damit anfängst.',
    lead: 'Funktioniert in Hover-Karten, auf Profilseiten, bei einzelnen Tweets und in der Timeline. Ohne Einrichtung.',
    readings: {
      country: {
        name: 'Land',
        body: "Das Land, aus dem das Konto postet. Erscheint in der Hover-Karte, und in der Timeline, wenn du's einschaltest.",
      },
      region: {
        name: 'Region',
        body: 'Manchmal meldet X statt eines Landes eine Region. Du kriegst den Kurzcode: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X markiert manche Standorte als möglicherweise ungenau. Die Flagge ist trotzdem da — du weißt nur, dass du ihr weniger trauen solltest.',
      },
      registration: {
        name: 'Registrierung',
        body: 'Über welchen App Store das Konto angelegt wurde. Meist das verlässlichere der beiden Signale.',
      },
      cooldown: {
        name: 'Abkühlphase',
        body: 'X deckelt die Abfragen pro 15 Minuten. Erreichst du die Grenze, zeigt dir ein Countdown, wann sie fällt — statt dich raten zu lassen, warum keine Flagge kommt.',
      },
    },
    hide: {
      title: 'Blend die Länder aus, die du nicht lesen willst.',
      p1: 'Wenn du siehst, wo ein Beitrag herkommt, kannst du handeln. Wähl die Orte, die du lieber überspringst, und entscheid, was mit den Tweets passiert.',
      p2: 'Einklappen ist die Voreinstellung. Der Tweet schrumpft zu einer schmalen Leiste <b>🚫 Ausgeblendet · 🇮🇳 Indien</b> mit einem Anzeigen-Knopf — du siehst also, dass da was war, und ein Klick holt ihn dauerhaft zurück. Der Filter folgt dem App-Store-Land, wenn eins da ist, und lässt Tweets, die du bewusst geöffnet hast, in Ruhe.',
      p3: 'Land ist nicht dein einziges Werkzeug. Sperr eine Organisation und alle Konten, die X ihr zuordnet, verschwinden mit. Konten jünger als deine selbst gesetzte Schwelle werden markiert, sobald sie auftauchen — markiert, nie ausgeblendet. Neu zu sein beweist nämlich gar nichts.',
      readoutCollapse: 'Einklappen',
      readoutCollapseValue: 'Schmale Leiste + Anzeigen',
      readoutHide: 'Ausblenden',
      readoutHideValue: 'Komplett weg',
      readoutOff: 'Aus',
      readoutOffValue: 'Nur Flaggen',
      previewRemoved: 'Tweet entfernt',
    },
    highlight: {
      title: 'Markier die Konten, die du auf den ersten Blick erkennen willst.',
      p1: 'Leg ein paar Stichwörter fest — jeder Tweet, dessen Autor passt, kriegt einen bernsteinfarbenen Rand, die Treffer stehen neben dem Handle. Vollgestopfte Flaggen-Bios werden genauso erwischt, ab der Anzahl, die du für zu viel hältst.',
      p2: 'Die Regeln liegen auf der Optionsseite der Erweiterung, zusammen mit den Ausnahmen: eine Freigabeliste für Konten, die keine Regel anrühren darf, und regelweise Ausnahmen für das Konto, das du vom Stichwort verschonen willst, aber nicht vom Land.',
      readoutMatch: 'Trifft auf',
      readoutMatchValue: 'Name · Bio',
      readoutFlags: 'Flaggenzahl',
      readoutFlagsValue: 'Deine Schwelle',
      readoutExceptions: 'Ausnahmen',
      readoutExceptionsValue: 'Pro Konto',
      optionsTitle: 'Optionen',
      optionsSaved: 'gespeichert',
      optionsByKeyword: 'Nach Stichwort 🔍',
      optionsByFlags: 'Nach Flaggen 🏴',
      optionsPlaceholder: 'Stichwort eingeben …',
    },
    cache: {
      title: 'Ein Cache, den alle befüllen',
      p1: 'Flaggen, die du nachschlägst, und Flaggen, die andere nachschlagen, landen im selben Topf — die meisten Profile kommen also sofort, ganz ohne eine deiner Abfragen zu kosten. Nach draußen gehen nur das öffentliche Handle und seine Flagge. Dein Konto, deine Cookies, Bios und dein Verlauf nicht.',
      p2: 'Ein einziger Schalter schaltet das aus, und damit enden auch die Hintergrund-Abfragen. Danach spricht die Erweiterung nur noch mit X, und nur, wenn du fragst.',
      contributors: 'Mitwirkende',
      shared: 'geteilt',
      instant: '⚡ sofort',
    },
    swipe: {
      title: 'Und auf dem Handy: einmal wischen',
      p1: 'Wisch einen Tweet nach rechts, und der Standort des Autors erscheint. Die Abfrage feuert schon während der Wischbewegung, nicht erst beim Loslassen. Ein Overlay zeigt dir das Land.',
      p2: "Auf Android brauchst du einen Browser, der Desktop-Erweiterungen kann. <b>{browser}</b> ist der, mit dem's getestet wurde.",
    },
  },

  trust: {
    heading:
      'Eine Erweiterung, die deine X-Session liest, sollte besser Klartext reden.',
    lead: 'Bitte sehr. Abfragen gehen direkt an x.com, genau wie die Anfragen der Website selbst, und nie über einen unserer Server. Dein Browser behält die Ergebnisse 30 Tage, und die Optionsseite löscht sie jederzeit.',
    body: 'Keine Analytik, keine Telemetrie in der Erweiterung. Diese Website nutzt Google Analytics — für Besucherzahlen und welcher Install-Button geklickt wurde. Sonst nichts.',
    readPolicy: 'Die vollständige Datenschutzerklärung lesen',
    neverTitle: 'Wird nie irgendwohin gesendet',
    neverNote:
      'Dafür gibt es keine Einstellung. Die Erweiterung liest das nie.',
    never: [
      'Dein X-Konto, Cookies oder Session-Tokens',
      'Bios, Anzeigenamen oder irgendwas, das du liest',
      'Deinen Browserverlauf oder deine Aktivität auf X',
      'Alles, was dich persönlich identifiziert',
    ],
    optTitle: 'Nur bei eingeschaltetem Cache',
    optNote:
      'Ein Schalter auf der Optionsseite steuert das. Schalt ihn aus, und nichts geht raus.',
    optional: [
      'Das öffentliche Handle, das du nachgeschlagen hast, z. B. @jack',
      'Seine Flaggendaten: Standort, Quelle, VPN-Hinweis',
      'Eine zufällige Installations-ID — damit die gleiche Flagge von verschiedenen Leuten nur einmal zählt',
    ],
  },

  compareTeaser: {
    heading: 'Nutzt du schon eine andere?',
    lead: 'Etwa zwanzig Erweiterungen setzen eine Flagge neben ein Handle. Die Unterschiede, auf die es ankommt, stehen nicht in der Funktionsliste — sondern darin, was der geteilte Cache darf und was passiert, wenn Xʼ fünfzig Abfragen aufgebraucht sind.',
    body: 'Diese hier taktet sich am echten Budget aus Xʼ eigenen Response-Headern und hält zehn Abfragen für die Konten zurück, die du hoverst — ein voller Thread füllt sich also zu Ende, statt auf halber Strecke stehen zu bleiben. Die ganze Tabelle hat vierzehn Zeilen und nennt die drei Dinge, die X-Posed besser macht.',
    link: 'Zum vollständigen Vergleich →',
  },

  cta: {
    heading: 'Hör auf zu raten, wo deine Timeline herkommt.',
    body: 'Kostenlos, und es läuft ab dem ersten Moment. Kein Konto nötig.',
  },

  faq: {
    heading: 'Fragen, die wirklich gestellt werden',
  },

  footer: {
    tagline:
      "Eine Landesflagge auf jedem X-Profil, aus X' eigenen Daten. Von einer Person gebaut, ohne Firma dahinter.",
    version: 'Version',
    notAffiliated:
      "Nicht mit X Corp. verbunden. Die Standortdaten stammen aus X' eigenen öffentlichen Endpunkten.",
    groupExtension: 'Die Erweiterung',
    groupGuides: 'Ratgeber',
    groupSmallPrint: 'Kleingedrucktes',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Das Projekt unterstützen',
    guideAboutAccount: 'X „Über dieses Konto"',
    guideEngagementFarming: 'Engagement-Farming erkennen',
    guideRateLimit: 'Das Limit von X',
    guideComparison: 'Im Vergleich zu X-Posed',
    privacyPolicy: 'Datenschutzerklärung',
    whatIsNotCollected: 'Was nicht erfasst wird',
    contact: 'Kontakt',
  },

  table: {
    caption:
      'X-Pat im Vergleich mit den drei meistinstallierten X-Standorterweiterungen',
    feature: 'Funktion',
    yes: 'ja',
    no: 'nein',
    notStated: 'nicht angegeben',
    notApplicable: 'nicht zutreffend',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Land direkt sichtbar, ohne Menü',
        note: 'Aus X\' eigenen „Über dieses Konto"-Daten, nicht per IP geraten.',
      },
      signupSource: {
        label: 'Registrierungsquelle — Apple, Google Play oder Web',
        note: '',
      },
      accountAge: { label: 'Kontoalter', note: '' },
      handleChanges: { label: 'Anzahl Handle-Wechsel', note: '' },
      hideByCountry: {
        label: 'Nach Land und Region ausblenden oder einklappen',
        note: 'Einklappen hinter „Anzeigen" ist die Voreinstellung — eine Timeline, die Beiträge stillschweigend schluckt, kannst du nicht prüfen.',
      },
      allowlist: {
        label: 'Immer-anzeigen-Liste und Ausnahmen pro Regel',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Taktet sich am Live-Budget aus X’ Rate-Limit-Headern',
        note: 'X-Pat liest die x-rate-limit-Header bei jeder Antwort und verteilt seine Abfragen über das, was im Fenster übrig ist, mit einem Anteil, der für deine Hovers zurückbleibt. X-Posed taktet mit festen 150 ms und acht parallelen Anfragen und liest den Reset-Header erst, nachdem ein 429 bereits da war.',
      },
      sharedCache: {
        label: 'Geteilter Cache, damit Flaggen das Limit überleben',
        note: 'X erlaubt einem Browser rund 50 Profilabfragen pro 15 Minuten. Ohne geteilten Cache ist genau das die Obergrenze.',
      },
      cacheServerSource: {
        label: 'Cache-Server-Quellcode offen',
        note: 'Der Server, der die Beiträge empfängt — nicht nur die Erweiterung, die sie schickt. Unserer liegt im selben Repo, mit Deploy-Anleitung. Du kannst ihn lesen oder deinen eigenen betreiben.',
      },
      crossChecked: {
        label: 'Cache-Einträge werden zwischen Installationen gegengecheckt',
        note: 'Wir speichern Stimmen pro Installation und liefern den Konsens, mit einstellbarer Vertrauensschwelle. X-Posed dokumentiert, den letzten akzeptierten Wert für ein Handle zu speichern.',
      },
      extensionSource: {
        label: 'Erweiterungs-Quellcode offen',
        note: '',
      },
      testSuite: {
        label: 'Automatisierte Testsuite im Repo',
        note: 'Unit-Tests, End-to-End gegen aufgezeichneten Traffic, visuelle Regression. Die Zahl ist das, was CI bei jedem Push durchläuft.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'Begleit-App für iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed ist das ausgereifte Projekt',
        body: 'Etwa 10.000 Chrome-Installationen gegen unsere Handvoll, vier Monate Vorsprung und ein Community-Cache mit Millionen Profilen — unserer hat Tausende. Ein größerer Cache heißt wirklich mehr sofortige Flaggen am ersten Tag. Das ist ein handfester Vorsprung, und er ist deutlich.',
      },
      surfaces: {
        title: 'Es ist auf mehr Plattformen vertreten',
        body: 'Firefox auf dem Desktop, Firefox für Android und eine iPhone-Begleit-App. X-Pat ist aktuell nur Chromium — Chrome, Edge, Brave und Lemur auf Android. Firefox ist geplant, iOS nicht.',
      },
      languageFilter: {
        title: 'Es hat einen Sprachfilter',
        body: "Wir haben keinen, und das mit Absicht. X' Sprachfeld pro Beitrag liegt oft genug daneben, dass Beiträge beim Filtern ohne erkennbaren Grund verschwinden. Das ist eine vertretbare Entscheidung, keine Lücke — aber wenn du genau deswegen hier bist: X-Posed hat ihn, wir nicht.",
      },
    },
    notApplicable: '—',
    testCount: '{count} Tests',
    none: 'keine',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Ratgeber',
      titleLead: 'X’',
      titleAccent: '„Über dieses Konto“',
      titleRest: ' — und wie du dir die Klickerei sparst.',
      lead: 'X weiß still und leise, aus welchem Land jedes Konto postet, und es verrät es dir auch — ein Profil nach dem anderen, drei Klicks tief, solang die Geduld reicht. Hier steht, wo das Panel steckt, was es kann und was nicht, und was du tust, wenn du dieselbe Info für achtzig Antworten brauchst statt für eine.',
      whereHeading: 'Wo das Panel wirklich sitzt',
      steps: {
        web: {
          where: 'Web',
          body: 'Öffne das Profil, dann das ⋯-Menü neben dem Folgen-Button. „Über dieses Konto" steht in der Liste.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Öffne das Profil und tipp auf ⋯ oben rechts im Header. Gleicher Eintrag, gleiches Panel.',
        },
        what: {
          where: 'Was du kriegst',
          body: 'Das Land des Kontos, ungefähres Beitrittsdatum, wie oft das Handle gewechselt hat und über welchen App Store es registriert wurde.',
        },
      },
      cantHeading: 'Was es nicht kann',
      cant1:
        'Das Panel ist pro Profil und modal. Fein, wenn du ein einzelnes Konto prüfst. Nutzlos, wenn du einen Antwort-Thread liest — und genau dann stellt sich die Frage meistens. Hundert Antworten sind hundert Ausflüge ins Menü, und beim dritten hast du den Thread verloren.',
      cant2:
        "Es ist auch nicht immer gefüllt. X liefert für etliche Konten kein Land — oft alte oder kaum aktive. Wenn das Feld wirklich leer ist, gibt's nichts zu zeigen. Wer was anderes behauptet, rät über die IP.",
      cant3:
        'Und zur Verlässlichkeit sagt es nichts. X markiert intern manche Standorte als „nicht bestätigbar". Das Panel zeigt trotzdem die Flagge.',
      sameHeading: 'Das gleiche Feld, ohne Menü',
      same1:
        'X-Pat liest genau das Feld, das auch das Panel liest — denselben Endpunkt, über die X-Session, die eh in deinem Browser liegt — und malt es als Flagge in die Hover-Karte und auf Wunsch direkt in die Timeline. Keine IP-Abfragen, keine Fremddatenbank, kein Konto und kein API-Key.',
      same2:
        'Drei Dinge holt es aus der Antwort: das Land, den App Store der Registrierung und ob X den Standort als nicht prüfbar kennzeichnet — genau das Vertrauenssignal, das das Panel unterschlägt. Beitrittsdatum und Handle-Historie bleiben im Panel; die Erweiterung will gar nicht das ganze Panel sein.',
      same3:
        'Und du kannst handeln: Länder und Regionen, die du nicht lesen willst, klappen hinter einem „Anzeigen"-Knopf ein oder verschwinden. Die Voreinstellung ist Einklappen — denn einer Timeline, die Beiträge stillschweigend schluckt, kannst du nicht trauen.',
    },

    engagementFarming: {
      kicker: 'Ratgeber',
      titleLead: 'Wie man',
      titleAccent: 'Engagement-Farming',
      titleRest: ' auf X erkennt.',
      lead: 'Seit X nach Impressionen auszahlt, ist Antworten ein Job. Kein gut bezahlter — genau deswegen sieht das Ergebnis so aus: schnell, generisch und unter alles geklebt, was grade trendet. Hier sind die Signale, die eine echte Antwort von einer gefarmten unterscheiden.',
      noVerdictHeading: 'Ein einzelnes Signal ist noch kein Urteil',
      noVerdict1:
        'Jedes Anzeichen unten hat eine harmlose Erklärung. Neue Konten sind halt neu. Manche Leute folgen großzügig. Viele nachdenkliche Poster haben ein Emoji in der Bio. Wer eins davon als Beweis nimmt, schreibt gewöhnliche Fremde ab — unangenehm und außerdem langweilig.',
      noVerdict2:
        'Was funktioniert, ist die Kombination. Ein drei Wochen altes Konto, folgt Tausenden, gefolgt von Dutzenden, als Erstes in den Antworten mit einer Standardfloskel — das ist kein Zufall, und du liest es in zwei Sekunden, wenn du weißt, wohin du schauen musst.',
      colSignal: 'Signal',
      colTell: "So sieht's aus",
      colCost: 'Aufwand',
      signals: {
        ratio: {
          signal: 'Follower-zu-Following-Verhältnis',
          tell: 'Folgt 4.000, gefolgt von 40',
          cost: 'Ein Blick auf die Hover-Karte',
        },
        age: {
          signal: 'Kontoalter',
          tell: 'Vor drei Wochen beigetreten, schon tief in Politik-Threads',
          cost: 'Hover-Karte',
        },
        latency: {
          signal: 'Antwortgeschwindigkeit',
          tell: 'Erste Antwort in Sekunden, von einem Konto ohne jede Vorgeschichte mit dem Autor',
          cost: "Der Zeitstempel, wenn's dich interessiert",
        },
        bio: {
          signal: 'Bio-Aufbau',
          tell: 'Eine Zeile Flaggen und Emoji, wo ein Satz hingehört',
          cost: 'Umsonst — steht ja direkt da',
        },
        substance: {
          signal: 'Inhalt der Antwort',
          tell: 'Die gleiche Standardfloskel, die du heute schon unter vier anderen Posts gesehen hast',
          cost: 'Vor allem Erinnerungsvermögen',
        },
        location: {
          signal: 'Wo das Konto sitzt',
          tell: 'Selbstbewusste Belehrung über ein Land, aus dem das Konto nie gepostet hat',
          cost: 'Drei Klicks pro Profil — oder direkt sichtbar',
        },
      },
      hiddenHeading: 'Das eine, das du nicht siehst',
      hidden1:
        'Fünf der sechs Signale stehen schon auf dem Bildschirm. Follower-Zahlen, Beitrittsdatum, die Bio, die Antwort selbst — X liefert dir das alles ungefragt. Das sechste ist das, was X hinter einem Menü versteckt: wo das Konto wirklich postet.',
      hidden2:
        "Für eine bestimmte Art von Ärger zählt es mehr als die anderen — nicht Spam im klassischen Sinn, sondern selbstbewusste Belehrung über einen Ort, mit dem das Konto nichts zu tun hat. Das liest sich komplett anders, wenn du's sehen kannst. Und X zwingt dich, dafür ein Panel pro Profil aufzumachen.",
      hidden3:
        '<b>Diesen Teil übernimmt X-Pat.</b> Packt das Land in die Hover-Karte und, wenn du willst, direkt in die Timeline — mit einer Warnung, wenn X selbst den Standort nicht bestätigen kann. Es bewertet keine Konten und fällt keine Urteile für dich; die anderen fünf Signale bleiben deine Sache. Es sorgt nur dafür, dass die eine wirklich versteckte Tatsache keine drei Klicks mehr kostet.',
    },

    comparison: {
      kicker: 'Vergleich',
      titleLead: 'X-Pat gegen',
      titleAccent: 'X-Posed',
      titleRest: ' — und den Rest des Regals.',
      lead: 'Etwa zwanzig Erweiterungen packen eine Landesflagge neben ein X-Handle. Drei davon haben nennenswerte Nutzerzahlen. Hier steht, was jede wirklich kann, was X-Pat anders macht, und die drei Dinge, die X-Posed besser macht — der Teil, den die meisten Vergleichsseiten weglassen.',
      featureHeading: 'Funktion für Funktion',
      featureLead:
        'Jede Angabe stammt aus einem öffentlichen Store-Eintrag oder einem öffentlichen Repository, gelesen am {date}. Ein Strich heißt: dazu schweigt der Eintrag. Bei den zwei Closed-Source-Erweiterungen ist das nicht dasselbe wie ein Nein, und es so darzustellen wäre unfair.',
      aheadHeading: 'Wo X-Posed vorne liegt',
      differsHeading: 'Was wirklich anders ist',
      differs1:
        'Alles in dieser Kategorie hängt an einem geteilten Cache. X erlaubt einem Browser rund fünfzig Profilabfragen pro Viertelstunde, und ein lebhafter Thread hat mehr Konten als das. Jede Erweiterung, die übers Limit hinaus weiterarbeitet, tut das über einen von anderen gefüllten Cache. Die Frage ist nicht, ob es einen Server gibt. Sondern was dieser Server darf.',
      differs2:
        '<b>Unserer ist offen, und du kannst deinen eigenen betreiben.</b> Der Cache-Server liegt im selben Repository wie die Erweiterung, mit Deploy-Anleitung für Cloudflare Workers wie für einen einfachen VPS. X-Posed veröffentlicht seine Erweiterung — ehrlich, und unter MIT — aber nicht den Worker, an den die Beiträge gehen. Genau das ist der Teil, den du nicht prüfen kannst, indem du den installierten Code liest.',
      differs3:
        '<b>Eine Cache-Antwort braucht hier Bestätigung.</b> Beiträge werden als Stimmen pro Installation gespeichert, ausgeliefert wird der Konsens, mit einer Vertrauensschwelle, die du hochsetzen kannst. X-Posed dokumentiert selbst, den letzten akzeptierten Wert für ein Handle zu speichern — der jüngste Beitragende entscheidet also. Beide Ansätze sind ehrlich in Bezug auf dasselbe Grundproblem: Kein Server kann beweisen, dass ein Beitrag wirklich von X kam.',
      differs4:
        '<b>Abfragen tragen keine Kennung.</b> Lesezugriffe sind eine unsignierte Handle-Liste — der Server hat nichts, womit er verknüpfen könnte, und kann kein „diese Installation hat diese Konten angesehen" aufbauen. Leser zu zählen wäre eine Zeile Code und würde diese Eigenschaft sofort zerstören. Deshalb zählen die veröffentlichten Statistiken mit Absicht zu niedrig.',
      differs5:
        'Und das Ratenlimit wird rationiert statt verheizt: Hintergrundarbeit stoppt bei achtzig Prozent des Fensters, die letzten zehn Abfragen bleiben für die Konten, die du wirklich hoverst. <a href="{href}">Der Mechanismus ist auf der Startseite aufgezeichnet</a>.',
      sourcesHeading: 'Quellen',
      sourcesLead:
        'Gelesen am {date}. Installationszahlen und Funktionen ändern sich. Falls etwas nicht mehr stimmt, ist das ein Fehler, keine Absicht — und der <a href="{href}">Issue-Tracker</a> der schnellste Weg zur Korrektur.',
      sourceLabel: ' — Quelle: ',
      sourceNotPublished: ' — Quellcode nicht veröffentlicht',
    },
  },

  pages: {
    home: {
      title: 'X-Pat — X-Profilstandort: das Land jedes X-Profils sehen',
      description:
        "Eine Landesflagge auf jedem X-Profil, aus X' eigenen Daten. VPN-Warnungen, Beiträge nach Land, Organisation, Kontenalter oder Bio-Stichwort ausblenden oder hervorheben. Kostenlos für Chrome.",
      faq: [
        {
          q: 'Wie sehe ich, aus welchem Land ein X-Konto kommt?',
          a: 'X hinterlegt für jedes Konto ein Land und zeigt es unter „Über dieses Konto" — aber immer nur ein Profil auf einmal und nur übers Menü. Diese Erweiterung liest dasselbe Feld und packt die Flagge direkt in die Hover-Karte und die Timeline. Du siehst sie, ohne einen einzigen Klick.',
        },
        {
          q: 'Kann ich erkennen, ob ein X-Konto ein VPN nutzt?',
          a: 'X markiert manche Konten mit einem nicht bestätigbaren Standort. Die Erweiterung zeigt das als ⚠ VPN-Badge neben der Flagge. Das bedeutet: X selbst ist sich beim Land unsicher — nicht, dass ein VPN bewiesen wäre.',
        },
        {
          q: 'Kann ich Tweets aus bestimmten Ländern ausblenden oder einklappen?',
          a: 'Ja. Wähl die Länder oder Regionen in den Optionen und entscheide, ob passende Tweets hinter „Anzeigen" einklappen oder ganz verschwinden. Voreinstellung ist Einklappen — es wird nie stillschweigend was aus deiner Timeline entfernt.',
        },
        {
          q: 'Kann ich nach mehr als nur dem Land filtern?',
          a: 'Ja. Du kannst alle X-einer-Organisation-zugeordneten Konten sperren, Konten unter einem selbstgewählten Alter markieren und Konten hervorheben, deren Name oder Bio auf deine Stichwörter passt — oder deren Bio überwiegend aus Flaggen-Emoji besteht. Alters- und Stichwortregeln markieren nur, sie entfernen nie. Eine Freigabeliste und Ausnahmen pro Regel decken die Konten ab, die du in Ruhe lassen willst.',
        },
        {
          q: 'Braucht sie mein X-Passwort oder einen API-Key?',
          a: 'Weder noch. Sie nutzt die X-Session, die eh in deinem Browser liegt, für genau die gleiche Anfrage, die die Website beim Profilaufruf stellt. Kein Login, kein API-Key, kein Konto bei uns.',
        },
        {
          q: 'Wie genau ist der Standort?',
          a: "Genau so genau wie X' eigene Daten — weil es X' eigene Daten sind. Die Erweiterung rät nichts per IP und fragt keine Fremddatenbank. Wo X einen Standort als unbestätigt markiert, tut sie dasselbe.",
        },
      ],
    },

    aboutThisAccount: {
      title: "X „Über dieses Konto\": wo's steckt und wie's schneller geht",
      description:
        "X zeigt das Land jedes Kontos unter „Über dieses Konto\" — ein Profil nach dem anderen, hinter einem Menü. Hier findest du's, und hier, wie du's direkt kriegst.",
      faq: [
        {
          q: 'Was ist „Über dieses Konto" auf X?',
          a: 'Ein von X eingeführtes Panel: Land des Kontos, wann es beigetreten ist, wie oft das Handle gewechselt hat und über welchen App Store es registriert wurde. Genau das Länderfeld, das diese Erweiterung liest.',
        },
        {
          q: 'Wo finde ich „Über dieses Konto"?',
          a: 'Öffne ein Profil, tipp auf das ⋯-Menü rechts oben im Kopfbereich und wähl „Über dieses Konto". Im Web ist es dasselbe ⋯-Menü neben dem Folgen-Button.',
        },
        {
          q: 'Warum sehe ich „Über dieses Konto" bei manchen Nutzern nicht?',
          a: 'X liefert nicht für jedes Konto ein Land — bei älteren oder wenig aktiven ist oft nichts hinterlegt. Wenn das Feld wirklich leer ist, kann es kein Werkzeug füllen, auch dieses nicht.',
        },
        {
          q: 'Wie sehe ich das Land, ohne jedes Profil zu öffnen?',
          a: 'Genau diese Lücke schließt die Erweiterung. Sie liest dasselbe Feld und zeigt die Flagge in der Hover-Karte und, auf Wunsch, direkt in der Timeline. Durch einen Thread mit achtzig Antworten zu scrollen heißt also nicht mehr achtzig Menübesuche.',
        },
      ],
    },

    engagementFarming: {
      title: 'Engagement-Farming und Antwort-Spam auf X erkennen',
      description:
        'Die Signale, die eine echte Antwort auf X von einer gefarmten trennen: Kontoalter, Follower-Verhältnis, Posting-Muster und das Land, aus dem das Konto wirklich kommt.',
      faq: [
        {
          q: 'Was ist Engagement-Farming auf X?',
          a: 'Antworten, die auf Impressionen abzielen statt etwas zu sagen — generische Zustimmung, aufgewärmte Empörung oder eine Standardfloskel unter dem Beitrag, der grade trendet. Seit X nach Impressionen auszahlt, steckt da ein direktes finanzielles Motiv dahinter.',
        },
        {
          q: 'Woran erkenne ich, ob eine X-Antwort von einem Bot oder einer Farm kommt?',
          a: 'Kein einzelnes Signal beweist es. Die aussagekräftigen stapeln sich: Ein Konto, das Tausenden folgt, während ihm Dutzende folgen, vor Wochen erstellt, antwortet in Sekunden auf große Accounts, Bio voller Flaggen und Emoji. Jedes für sich ist normal; drei zusammen sind selten Zufall.',
        },
        {
          q: 'Welches Follower-zu-Following-Verhältnis deutet auf eine Farm hin?',
          a: 'Deutlich mehr Konten folgen, als selbst folgen — ein Verhältnis klar unter 0,1 — ist das klassische Muster. Massenfolgen ist der billigste Weg, aufzufallen. Viele ganz normale neue Konten sehen genauso aus. Also: ein Hinweis, kein Urteil.',
        },
        {
          q: 'Erkennt die Erweiterung Engagement-Farming?',
          a: 'Nicht direkt. Sie macht Land und VPN-Status des Kontos direkt sichtbar — das eine Signal, das du sonst ohne Öffnen jedes einzelnen Profils gar nicht sehen kannst. Die übrigen Signale auf dieser Seite bleiben eine Einschätzung, die du selbst triffst.',
        },
      ],
    },

    rateLimit: {
      title: 'Das Limit von X: 50 Profilabfragen alle 15 Minuten',
      description:
        'X erlaubt einem Browser rund 50 Kontoabfragen alle 15 Minuten. Wie X-Pat dieses Fenster einteilt und warum die meisten Profile keine davon kosten.',
      faq: [],
    },

    comparison: {
      title: 'X-Posed-Alternative: X-Pat im Vergleich, Funktion für Funktion',
      description:
        'Ein ehrlicher Vergleich von X-Pat mit X-Posed und den zwei anderen meistinstallierten X-Standorterweiterungen — samt der drei Dinge, die X-Posed besser macht.',
      faq: [
        {
          q: 'Was ist die beste X-Posed-Alternative?',
          a: 'Kommt drauf an, was du brauchst. X-Posed ist die etablierteste Option und hat einen Sprachfilter, Firefox-Builds und eine iPhone-App, die X-Pat nicht hat. X-Pat unterscheidet sich beim geteilten Cache: Sein Server ist offen und selbst hostbar, Cache-Einträge werden vor der Auslieferung zwischen Installationen gegengecheckt, und Abfragen tragen keine Kennung, mit der der Server ein Profil deiner Lesegewohnheiten bauen könnte.',
        },
        {
          q: 'Ist X-Pat Open Source?',
          a: 'Ja, MIT-lizenziert, und der Cache-Server ebenfalls — beide im selben Repository, mit Deploy-Anleitung für Cloudflare Workers und einen einfachen VPS. X-Posed veröffentlicht seine Erweiterung auch unter MIT; was es nicht veröffentlicht, ist der Worker, der die Community-Cache-Beiträge empfängt.',
        },
        {
          q: 'Brauchen diese Erweiterungen mein X-Passwort?',
          a: 'Keine der hier verglichenen. Sie alle nutzen die offene X-Session in deinem Browser für die gleiche Anfrage, die X beim Profilaufruf stellt. Kein Login, kein API-Key, kein Drittkonto.',
        },
        {
          q: 'Warum erscheinen die Flaggen mitten im Thread nicht mehr?',
          a: 'X erlaubt einem Browser rund fünfzig Kontoabfragen pro Viertelstunde, und ein lebhafter Thread hat mehr Konten. Erweiterungen, die ans Limit stoßen, zeigen einfach keine Flaggen mehr. Ein geteilter Cache umgeht das — fast alle Profile kosten nichts, weil sie schon jemand anderes aufgelöst hat. X-Pat reserviert zusätzlich die letzten zwanzig Prozent des Fensters für Konten, die du selbst hoverst.',
        },
      ],
    },
  },
}
