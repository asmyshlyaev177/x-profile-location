import type { Dict } from './en'

/** French. "Vous" throughout — "tu" reads as forced familiarity from a product. */
export const fr: Dict = {
  nav: {
    sections: 'Sections',
    screenshots: 'Captures',
    howItWorks: 'Fonctionnement',
    features: 'Fonctionnalités',
    privacy: 'Confidentialité',
    comparison: 'Comparatif',
    sourceOnGitHub: 'Code sur GitHub',
    home: 'X-Pat — accueil',
  },

  language: {
    label: 'Langue',
    choose: 'Choisir une langue',
  },

  install: {
    chrome: 'Ajouter à Chrome',
    edge: 'Ajouter à Edge',
    brave: 'Ajouter à Brave',
  },

  hero: {
    titleLead: 'Voyez d’où vient',
    titleAccent: 'vraiment un profil X',
    lead: 'X sait déjà depuis quel pays chaque compte publie. Simplement, il ne vous le montre pas. Cette extension place le drapeau dans la carte de survol et vous permet de replier ou de masquer les pays que vous préférez ne pas voir.',
    seeItRunning: 'Le voir en action',
    railWorksIn: 'Fonctionne sur',
    railAndroid: 'Sur Android',
    railAccount: 'Compte / clé API',
    railAccountValue: 'Ni l’un ni l’autre',
    railVersion: 'Version',
    panelFollowing: 'Abonnements',
    panelFollowers: 'Abonnés',
    panelHidden: '🚫 Masqué · 🇮🇳 Inde',
    panelShow: 'Afficher',
  },

  screenshots: {
    heading: 'Le voilà, en action dans X.',
    lead: 'Des captures d’un fil ordinaire. Choisissez-en une pour le voir fonctionner.',
    fullSize: 'Taille réelle',
    viewer: 'Visionneuse de captures',
    close: 'Fermer',
    prev: 'Capture précédente',
    next: 'Capture suivante',
    railLabel: 'Captures d’écran',
    shots: {
      copy: {
        label: 'Copier en image',
        alt: 'Une carte au survol avec les boutons Post et À propos près du drapeau, et à côté la page « À propos de ce compte » copiée en image',
      },
      hover: {
        label: 'Drapeau au survol',
        alt: 'Une carte de survol X avec un drapeau allemand et le mot Allemagne sous le pseudo',
      },
      vpn: {
        label: 'Alerte VPN',
        alt: 'Une carte de survol montrant un drapeau américain à côté d’un badge rouge ⚠ VPN',
      },
      feed: {
        label: 'Drapeaux dans le fil',
        alt: 'Un fil où chaque auteur affiche son drapeau directement, sans avoir à survoler',
      },
      blocked: {
        label: 'Masqué dans le fil',
        alt: 'Un fil où un post est replié derrière une barre « 🚫 Masqué · Égypte » et un bouton Afficher',
      },
      keyword: {
        label: 'Surlignage par mot-clé',
        alt: 'Un tweet surligné en ambre parce que la bio de l’auteur correspond à un mot-clé enregistré',
      },
      flagBios: {
        label: 'Bios bourrées de drapeaux',
        alt: 'Un compte signalé pour avoir empilé trop de drapeaux dans sa bio',
      },
      swipe: {
        label: 'Balayage sur mobile',
        alt: 'Un fil en largeur mobile où un balayage vers la droite révèle le pays de l’auteur en surimpression',
      },
    },
  },

  howItWorks: {
    heading: 'D’où vient vraiment le drapeau',
    lead: 'Chaque compte X a un pays attribué. X le cache derrière un menu que presque personne n’ouvre. Rien ici ne tente de deviner une adresse IP ni ne consulte une base de données externe.',
    steps: {
      hover: {
        title: 'Vous survolez un profil',
        body: 'Ou vous balayez un tweet vers la droite, si vous êtes sur téléphone. Aucune page de réglages à ouvrir au préalable ; la recherche se fait là où votre curseur se trouve déjà.',
        readoutKey: 'Déclencheur',
        readoutValue: 'survol · balayage · fil',
      },
      ask: {
        title: 'Votre navigateur interroge X directement',
        body: 'Il utilise la session que vous avez déjà dans votre navigateur pour faire exactement la même requête que le site quand il vous affiche un compte. Rien ne passe par nous.',
        readoutKey: 'Point d’accès',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Le drapeau apparaît dans la carte',
        body: 'Votre navigateur garde la réponse pendant 30 jours. Le deuxième coup d’œil ne coûte rien. Un bouton dans la page d’options permet de tout effacer.',
        readoutKey: 'Cache',
        readoutValue: 'local · 30 jours',
      },
    },
  },

  rateBudget: {
    link: 'Comment fonctionne le budget',
    heading: 'Le quota de X, contourné plutôt que subi.',
    lead: 'Vous avez déjà vu le problème. Le haut d’un fil se remplit, puis plus rien. C’est le quota : cinquante consultations de comptes par quart d’heure, et un fil actif contient plus de comptes que cela.',
    body: 'Ici, la plupart des profils ne coûtent rien. Ils sont déjà en cache, ou quelqu’un d’autre les a consultés et le cache partagé répond. Le reste est rationné.',
    closing:
      'Si vous l’épuisez malgré tout, vous obtenez un compte à rebours jusqu’au renouvellement, pas un drapeau vide. La répartition comme le rythme sont tous deux réglables.',
    facts: {
      real: {
        title: 'Le vrai chiffre',
        body: 'Le quota provient des en-têtes de réponse de X eux-mêmes, pas d’une estimation figée à la compilation. Vos propres survols y sont décomptés.',
        readoutKey: 'Source',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Étalé, pas épuisé d’un coup',
        body: 'Environ une consultation toutes les 21 secondes, recalculée en continu — le rythme se détend quand vous survolez beaucoup, se resserre quand la fenêtre se recharge.',
        readoutKey: 'Rythme',
        readoutValue: 'fenêtre ÷ quota',
      },
      hovers: {
        title: 'Le survol l’emporte toujours',
        body: 'Le travail d’arrière-plan s’arrête à 85 %, si bien que le reste de la fenêtre est réservé aux comptes que vous survolez vous-même.',
        readoutKey: 'Réservé',
        readoutValue: '8 sur 50',
      },
    },
    bar: {
      caption: 'Une fenêtre de 15 minutes',
      alt: 'Cinquante consultations par fenêtre : quarante-deux disponibles pour le préchargement en arrière-plan, huit réservées aux comptes que vous survolez.',
      backgroundNote:
        'en arrière-plan, réparties tout au long des quinze minutes',
      reservedNote:
        'gardées en réserve, pour qu’un survol ne soit jamais la requête qui vous met à sec',
    },
  },

  features: {
    heading: 'Une information, et ce que vous en faites.',
    lead: 'Cela fonctionne sur les cartes de survol, les pages de profil, les tweets isolés et dans le fil. Rien à configurer au préalable.',
    readings: {
      country: {
        name: 'Pays',
        body: 'Le pays depuis lequel le compte publie. Il apparaît dans la carte de survol, et dans le fil si vous l’activez.',
      },
      region: {
        name: 'Région',
        body: 'Parfois X indique une région plutôt qu’un pays. Vous recevez son code court : NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X peut marquer une localisation comme potentiellement inexacte. Le pays s’affiche quand même ; vous savez simplement qu’il faut le prendre avec prudence.',
      },
      registration: {
        name: 'Inscription',
        body: 'La boutique d’applications par laquelle le compte a été créé. Généralement le plus fiable des deux signaux.',
      },
      cooldown: {
        name: 'Délai de repos',
        body: 'X plafonne les consultations autorisées en 15 minutes. Si vous atteignez le plafond, un compte à rebours vous indique quand il se lève, au lieu de vous laisser vous demander pourquoi le drapeau n’est jamais apparu.',
      },
    },
    hide: {
      title: 'Masquez les pays que vous préférez ne pas lire.',
      p1: 'Une fois que vous voyez d’où vient une publication, vous pouvez agir. Choisissez les pays à contourner et décidez du sort de leurs tweets.',
      p2: 'Le repli est le comportement par défaut. Le tweet se réduit à une fine barre <b>🚫 Masqué · 🇮🇳 Inde</b> avec un bouton Afficher : vous savez donc qu’il y avait quelque chose, et un clic le ramène définitivement. Le filtre suit le pays de la boutique d’applications quand il y en a un, et il épargne le tweet que vous avez ouvert exprès.',
      p3: 'Le pays n’est pas votre seul levier. Bloquez une organisation et toutes les comptes que X y rattache disparaissent aussi. Les comptes plus récents qu’un seuil que vous fixez sont marqués dès leur apparition — marqués, jamais masqués, car être récent ne prouve rien.',
      readoutCollapse: 'Replier',
      readoutCollapseValue: 'Barre fine + Afficher',
      readoutHide: 'Masquer',
      readoutHideValue: 'Supprimé purement et simplement',
      readoutOff: 'Désactivé',
      readoutOffValue: 'Drapeaux seuls',
      previewRemoved: 'tweet retiré',
    },
    highlight: {
      title: 'Repérez de loin les comptes qui vous intéressent.',
      p1: 'Enregistrez quelques mots-clés et tout tweet dont l’auteur correspond reçoit une bordure ambre, avec les mots trouvés affichés à côté du pseudo. Les bios bourrées de drapeaux sont repérées de la même manière, à partir du nombre que vous jugez excessif.',
      p2: 'Les règles sont dans la page d’options de l’extension, avec leurs exceptions : une liste blanche pour les comptes qu’aucune règle ne peut toucher, et des exemptions par règle pour le compte que vous voulez épargner du mot-clé mais pas du pays.',
      readoutMatch: 'Recherche sur',
      readoutMatchValue: 'Nom · bio',
      readoutFlags: 'Nb de drapeaux',
      readoutFlagsValue: 'Votre seuil',
      readoutExceptions: 'Exceptions',
      readoutExceptionsValue: 'Par compte',
      optionsTitle: 'Options',
      optionsSaved: 'enregistré',
      optionsByKeyword: 'Surligner par mot-clé 🔍',
      optionsByFlags: 'Surligner par drapeaux 🏴',
      optionsPlaceholder: 'Saisissez un mot-clé…',
    },
    cache: {
      title: 'Un cache que tout le monde nourrit',
      p1: 'Les drapeaux que vous cherchez et ceux que d’autres cherchent atterrissent dans le même réservoir : la plupart des profils s’affichent donc instantanément sans consommer de consultation. Seuls le pseudo public et son drapeau circulent. Votre compte, vos cookies, les bios et votre historique, rien de tout cela ne sort.',
      p2: 'Un seul interrupteur désactive tout. Le désactiver arrête aussi les consultations d’arrière-plan. Ensuite, l’extension ne parle à personne d’autre qu’à X, et seulement quand vous le demandez.',
      contributors: 'contributeurs',
      shared: 'partagés',
      instant: '⚡ instantané',
    },
    swipe: {
      title: 'Et sur mobile, un balayage',
      p1: 'Balayez n’importe quel tweet vers la droite pour obtenir la localisation de son auteur. Cela se déclenche en cours de geste, sans attendre que vous leviez le doigt, et une surimpression vous indique le pays.',
      p2: 'Sur Android, il vous faut un navigateur capable d’exécuter des extensions de bureau. <b>{browser}</b> est celui sur lequel l’extension a été testée.',
    },
  },

  trust: {
    heading: 'Une extension qui lit votre session X a intérêt à être précise.',
    lead: 'Alors voilà. Les consultations vont directement à x.com, exactement comme les requêtes du site lui-même, et jamais via un serveur à nous. Votre navigateur conserve les résultats pendant 30 jours, et la page d’options les efface quand vous le souhaitez.',
    body: 'L’extension ne contient ni analytique ni télémétrie. Ce site web utilise Google Analytics, pour le nombre de visites et le bouton d’installation cliqué — rien de plus.',
    readPolicy: 'Lire la politique de confidentialité complète',
    neverTitle: 'Jamais envoyé nulle part',
    neverNote:
      'Il n’y a pas de réglage pour cela. L’extension ne les lit jamais.',
    never: [
      'Votre compte X, vos cookies ou vos jetons de session',
      'Les bios, les noms affichés, ou quoi que ce soit que vous lisez',
      'Votre historique de navigation ou votre activité sur X',
      'Tout ce qui vous identifie personnellement',
    ],
    optTitle: 'Uniquement avec le cache activé',
    optNote:
      'Un seul interrupteur dans la page d’options le contrôle. Coupez-le et rien ne sort.',
    optional: [
      'Le pseudo public consulté, par exemple @jack',
      'Ses données de drapeau : localisation, source, indicateur VPN',
      'Un identifiant d’installation aléatoire, pour que le même drapeau provenant de personnes différentes ne compte qu’une seule fois',
    ],
  },

  compareTeaser: {
    heading: 'Vous utilisez déjà l’une des autres ?',
    lead: 'Une vingtaine d’extensions placent un drapeau à côté d’un pseudo. Les différences qui comptent ne sont pas dans la liste des fonctionnalités — elles sont dans ce que le cache partagé a le droit de faire, et dans ce qui se passe quand les cinquante consultations de X sont épuisées.',
    body: 'Celle-ci se cale sur le budget réel annoncé par les en-têtes de réponse de X et garde huit consultations pour les comptes que vous survolez : un fil chargé finit de se remplir au lieu de s’arrêter à mi-chemin. Le tableau complet couvre quatorze lignes et nomme les trois domaines où X-Posed fait mieux que cette extension.',
    link: 'Voir la comparaison complète →',
  },

  cta: {
    heading: 'Arrêtez de deviner d’où vient votre fil.',
    body: 'Gratuit, et fonctionnel dès l’installation. Aucun compte à créer.',
  },

  faq: {
    heading: 'Les questions que les gens posent vraiment',
  },

  footer: {
    tagline:
      'Un drapeau national sur chaque profil X, tiré des données de X lui-même. Construit par une seule personne, sans entreprise derrière.',
    version: 'Version',
    notAffiliated:
      'Sans affiliation avec X Corp. Les données de localisation proviennent des points d’accès publics de X.',
    groupExtension: 'L’extension',
    groupGuides: 'Guides',
    groupSmallPrint: 'Mentions légales',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Soutenir le projet',
    guideAboutAccount: 'X « À propos de ce compte »',
    guideEngagementFarming: 'Repérer l’engagement farming',
    guideRateLimit: 'La limite de X',
    guideComparison: 'Comparé à X-Posed',
    privacyPolicy: 'Politique de confidentialité',
    whatIsNotCollected: 'Ce qui n’est pas collecté',
    contact: 'Contact',
  },

  table: {
    caption:
      'X-Pat comparé aux trois extensions de localisation X les plus installées',
    feature: 'Fonctionnalité',
    yes: 'oui',
    no: 'non',
    notStated: 'non précisé',
    notApplicable: 'sans objet',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Pays affiché en ligne, sans ouvrir de menu',
        note: 'Lu depuis les données « À propos de ce compte » de X, pas deviné à partir d’une adresse IP.',
      },
      signupSource: {
        label: 'Origine de l’inscription — Apple, Google Play ou web',
        note: '',
      },
      accountAge: { label: 'Ancienneté du compte', note: '' },
      handleChanges: {
        label: 'Nombre de changements de pseudo',
        note: '',
      },
      hideByCountry: {
        label: 'Masquer ou replier par pays et par région',
        note: 'Le repli derrière un bouton « Afficher » est ici le comportement par défaut, parce qu’un fil qui supprime des messages en silence est un fil que vous ne pouvez pas vérifier.',
      },
      allowlist: {
        label: 'Liste blanche « toujours afficher » et exceptions par règle',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Se cale sur le budget réel des en-têtes de quota de X',
        note: 'X-Pat lit les en-têtes x-rate-limit à chaque réponse et répartit ses consultations sur ce qui reste de la fenêtre, en gardant une part pour les comptes que vous survolez. X-Posed avance à un intervalle fixe de 150 ms avec huit requêtes en parallèle et ne lit l’en-tête de réinitialisation qu’après un 429.',
      },
      sharedCache: {
        label: 'Cache partagé, pour que les drapeaux survivent au quota',
        note: 'X autorise environ 50 consultations de profil par navigateur et par quart d’heure. Sans cache partagé, ce plafond définit toute l’expérience.',
      },
      cacheServerSource: {
        label: 'Code du serveur de cache publié',
        note: 'Le serveur qui reçoit les contributions, pas seulement l’extension qui les envoie. Le nôtre est dans le même dépôt, avec une documentation de déploiement — vous pouvez le lire, ou faire tourner le vôtre.',
      },
      crossChecked: {
        label: 'Entrées du cache recoupées entre installations',
        note: 'Chez nous, chaque installation vote et c’est le consensus qui est servi, avec un seuil de confiance que vous pouvez relever. X-Posed documente le stockage de la dernière valeur acceptée pour un pseudo.',
      },
      extensionSource: {
        label: 'Code de l’extension publié',
        note: '',
      },
      testSuite: {
        label: 'Suite de tests automatisés dans le dépôt',
        note: 'Tests unitaires, de bout en bout sur du trafic enregistré, et de régression visuelle. Le chiffre est ce que l’intégration continue exécute à chaque push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'Application compagnon iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed est l’extension mature',
        body: 'Environ 10 000 installations Chrome contre notre poignée, quatre mois d’avance, et un cache communautaire de plusieurs millions de profils là où le nôtre en compte des milliers. Un cache plus grand, cela signifie concrètement plus de drapeaux instantanés au premier jour. Cet avantage est réel et l’écart n’est pas près de se combler.',
      },
      surfaces: {
        title: 'Elle est disponible sur plus de plateformes',
        body: 'Firefox pour ordinateur, Firefox pour Android, et une application compagnon pour iPhone. X-Pat est aujourd’hui limité à Chromium — Chrome, Edge, Brave, et Quetta sur Android. Firefox est prévu, iOS ne l’est pas.',
      },
      languageFilter: {
        title: 'Elle propose un filtre par langue',
        body: 'Pas nous, et c’est volontaire. Le champ de langue par message de X est suffisamment souvent erroné pour qu’un filtre fondé dessus fasse disparaître des messages sans raison apparente. C’est un choix défendable plutôt qu’un manque — mais si c’est un filtre par langue que vous cherchez, X-Posed l’a et nous pas.',
      },
    },
    notApplicable: '—',
    testCount: '{count} tests',
    none: 'aucun',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Guide',
      titleLead: 'Le panneau',
      titleAccent: '« À propos de ce compte »',
      titleRest: ' de X, et comment arrêter de cliquer pour y accéder.',
      lead: 'X sait très bien depuis quel pays chaque compte publie, et il vous le dira — un profil à la fois, à trois clics de profondeur, pour tous les profils que votre patience vous permet. Voici où se trouve ce panneau, ce qu’il peut et ne peut pas répondre, et que faire quand vous voulez la même information pour quatre-vingts réponses plutôt qu’une.',
      whereHeading: 'Où se trouve vraiment le panneau',
      steps: {
        web: {
          where: 'Web',
          body: 'Ouvrez le profil, puis le menu ⋯ à côté du bouton Suivre. « À propos de ce compte » figure dans cette liste.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Ouvrez le profil et touchez le ⋯ en haut à droite de l’en-tête. Même entrée, même panneau.',
        },
        what: {
          where: 'Ce que vous obtenez',
          body: 'Le pays où le compte est basé, la date approximative de sa création, le nombre de changements de pseudo, et la boutique d’applications par laquelle il s’est inscrit.',
        },
      },
      cantHeading: 'Ce à quoi il ne peut pas répondre',
      cant1:
        'Le panneau est modal et par profil. Très bien quand vous examinez un seul compte, parfaitement inutile quand vous lisez un fil de réponses — c’est-à-dire précisément au moment où la question se pose. Cent réponses, c’est cent allers-retours dans un menu, et dès la troisième vous avez perdu le fil de la conversation.',
      cant2:
        'Il n’est pas non plus toujours renseigné. X ne renvoie aucun pays pour un nombre non négligeable de comptes — souvent les plus anciens ou les moins actifs. Quand le champ est réellement vide, il n’y a rien à révéler, et tout outil prétendant le contraire ne fait que deviner à partir d’une adresse IP.',
      cant3:
        'Et il ne dit rien sur le degré de confiance. En interne, X marque certaines localisations comme invérifiables ; le panneau affiche le pays dans les deux cas.',
      sameHeading: 'Le même champ, sans le menu',
      same1:
        'X-Pat lit exactement le champ que lit le panneau — le même point d’accès, en utilisant la session X déjà présente dans votre navigateur — et l’affiche sous forme de drapeau dans la carte de survol, et en option directement dans le fil. Aucune recherche d’IP, aucune base de données tierce, aucun compte ni clé API.',
      same2:
        'Il en extrait trois choses : le pays, la boutique d’applications par laquelle le compte s’est inscrit, et le fait que X signale ou non une localisation qu’il ne peut pas vérifier — le signal de confiance que le panneau omet. La date d’inscription et l’historique des pseudos restent où ils sont ; l’extension ne cherche pas à reproduire tout le panneau.',
      same3:
        'Vous pouvez aussi agir en conséquence : les pays et régions que vous préférez ne pas voir peuvent se replier derrière un bouton « Afficher », ou être masqués. Le repli est le comportement par défaut, parce qu’un fil qui supprime des messages en silence est un fil auquel vous ne pouvez pas vous fier.',
    },

    engagementFarming: {
      kicker: 'Guide',
      titleLead: 'Comment repérer',
      titleAccent: 'l’engagement farming',
      titleRest: ' sur X.',
      lead: 'Depuis que X rémunère les impressions, répondre est devenu un métier. Mal payé, ce qui explique exactement à quoi cela ressemble : rapide, générique, et collé sous ce qui est en tendance. Voici les signaux qui distinguent vraiment une réponse authentique d’une réponse fabriquée.',
      noVerdictHeading: 'Aucun signal isolé ne suffit',
      noVerdict1:
        'Chacun des indices ci-dessous a une explication innocente. Les nouveaux comptes sont nouveaux. Certaines personnes suivent généreusement. Beaucoup de gens réfléchis mettent un emoji dans leur bio. Prendre un seul de ces signaux pour une preuve vous fera condamner de parfaits inconnus, ce qui est à la fois désagréable et sans intérêt.',
      noVerdict2:
        'Ce qui marche, c’est de les cumuler. Un compte de trois semaines, abonné à des milliers de personnes, suivi par des dizaines, premier dans les réponses avec une phrase toute faite — cette combinaison n’est pas un hasard, et elle se lit en deux secondes une fois que vous savez où regarder.',
      colSignal: 'Signal',
      colTell: 'À quoi cela ressemble',
      colCost: 'Coût de la vérification',
      signals: {
        ratio: {
          signal: 'Rapport abonnés / abonnements',
          tell: 'Abonné à 4 000, suivi par 40',
          cost: 'Un coup d’œil à la carte de survol',
        },
        age: {
          signal: 'Ancienneté du compte',
          tell: 'Créé il y a trois semaines, déjà au cœur des fils politiques',
          cost: 'Carte de survol',
        },
        latency: {
          signal: 'Rapidité de la réponse',
          tell: 'Première réponse en quelques secondes, depuis un compte sans aucun historique avec l’auteur',
          cost: 'L’horodatage, si vous prenez la peine de regarder',
        },
        bio: {
          signal: 'Composition de la bio',
          tell: 'Une rangée de drapeaux et d’emojis là où il y aurait une phrase',
          cost: 'Gratuit — c’est sous vos yeux',
        },
        substance: {
          signal: 'Contenu de la réponse',
          tell: 'La même phrase toute faite déjà vue sous quatre autres messages aujourd’hui',
          cost: 'De la mémoire, surtout',
        },
        location: {
          signal: 'D’où le compte publie',
          tell: 'Donnant des leçons assurées sur un pays depuis lequel le compte n’a jamais publié',
          cost: 'Trois clics, par profil — ou en ligne',
        },
      },
      hiddenHeading: 'Celui que vous ne pouvez pas voir',
      hidden1:
        'Cinq des six signaux ci-dessus sont déjà visibles. Nombre d’abonnés, date d’inscription, la bio, la réponse elle-même — X vous donne tout cela sans que vous ayez à le demander. Le sixième est celui que X garde derrière un menu : le pays depuis lequel le compte publie réellement.',
      hidden2:
        'Il compte plus que les autres pour un type d’agacement bien particulier — pas vraiment du spam, mais des leçons péremptoires sur un endroit où le compte n’a aucun intérêt en jeu. Cela se lit très différemment une fois qu’on peut le voir, et X vous oblige à ouvrir un panneau par profil pour le découvrir.',
      hidden3:
        '<b>X-Pat s’occupe de cette partie.</b> Il place le pays dans la carte de survol et, si vous le voulez, en ligne dans le fil — avec en plus une alerte quand X lui-même ne peut pas vérifier la localisation. Il ne note pas les comptes et ne juge pas les réponses à votre place ; les cinq autres signaux restent votre affaire. Il empêche simplement la seule information réellement cachée de vous coûter trois clics.',
    },

    comparison: {
      kicker: 'Comparaison',
      titleLead: 'X-Pat face à',
      titleAccent: 'X-Posed',
      titleRest: ', et au reste du rayon.',
      lead: 'Une vingtaine d’extensions placent un drapeau national à côté d’un pseudo X. Trois d’entre elles ont un nombre d’utilisateurs significatif. Voici ce que fait réellement chacune, ce que X-Pat fait différemment, et les trois choses que X-Posed fait mieux — la partie que la plupart des pages de comparaison omettent.',
      featureHeading: 'Fonctionnalité par fonctionnalité',
      featureLead:
        'Chaque case provient d’une fiche de boutique publique ou d’un dépôt public, consultés le {date}. Un tiret signifie que la fiche ne le précise pas — pour les deux extensions à code fermé, cela n’équivaut pas à un non, et il serait injuste de le présenter comme tel.',
      aheadHeading: 'Là où X-Posed a l’avantage',
      differsHeading: 'Ce qui diffère vraiment',
      differs1:
        'Tout dans cette catégorie dépend d’un cache partagé. X autorise environ cinquante consultations de profil par navigateur et par quart d’heure, et un fil actif contient davantage de comptes — si bien que toute extension ici qui continue de fonctionner au-delà de la limite le fait en lisant un cache rempli par d’autres. La question n’est pas de savoir s’il y a un serveur. C’est de savoir ce que ce serveur a le droit de faire.',
      differs2:
        '<b>Le nôtre est publié, et vous pouvez faire tourner le vôtre.</b> Le serveur de cache se trouve dans le même dépôt que l’extension, avec une documentation de déploiement pour Cloudflare Workers comme pour un simple VPS. X-Posed publie son extension — réellement, et sous licence MIT — mais pas le Worker auquel ses contributions sont envoyées. C’est précisément la pièce que vous ne pouvez pas vérifier en lisant le code que vous avez installé.',
      differs3:
        '<b>Ici, une réponse en cache doit être corroborée.</b> Les contributions sont stockées comme des votes par installation et c’est le consensus qui est servi, avec un seuil de confiance que vous pouvez relever dans la page d’options. La documentation de X-Posed décrit le stockage de la dernière valeur acceptée pour un pseudo, ce qui revient à laisser le dernier contributeur décider. Les deux conceptions sont honnêtes sur le même problème de fond : aucun serveur ne peut prouver qu’une contribution provient réellement de X.',
      differs4:
        '<b>Les consultations ne portent aucun identifiant.</b> Les lectures sont une liste de pseudos non signée : le serveur n’a rien pour les recouper et ne peut pas construire un « cette installation a regardé ces comptes ». Compter les lecteurs tiendrait en une ligne de code et anéantirait cette propriété, raison pour laquelle les statistiques publiées sous-estiment volontairement.',
      differs5:
        'Et le quota est rationné plutôt que disputé : le travail d’arrière-plan s’arrête à quatre-vingt-cinq pour cent de la fenêtre, si bien que les huit dernières consultations restent disponibles pour les comptes que vous survolez vous-même. <a href="{href}">Le mécanisme est détaillé sur la page d’accueil</a>.',
      sourcesHeading: 'Sources',
      sourcesLead:
        'Consulté le {date}. Les chiffres d’installation et les fonctionnalités évoluent ; si quelque chose ci-dessous n’est plus à jour, c’est une erreur et non une position, et le <a href="{href}">suivi des tickets</a> est le moyen le plus rapide de la faire corriger.',
      sourceLabel: ' — source : ',
      sourceNotPublished: ' — source non publiée',
    },
  },

  pages: {
    home: {
      title:
        'X-Pat — Localisation des profils X : voyez le pays de n’importe quel profil',
      description:
        'Un drapeau national sur chaque profil X, tiré des données de X. Alertes VPN, et masquage ou surlignage des messages par pays, organisation, ancienneté ou mot-clé de bio. Gratuit pour Chrome.',
      faq: [
        {
          q: 'Comment voir de quel pays vient un compte X ?',
          a: 'X enregistre un pays pour chaque compte et l’affiche sous « À propos de ce compte », mais un seul profil à la fois et seulement si vous ouvrez le menu. Cette extension lit ce même champ et place le drapeau directement dans la carte de survol et dans le fil, si bien que vous le voyez sans rien cliquer.',
        },
        {
          q: 'Puis-je savoir si un compte X utilise un VPN ?',
          a: 'X marque certains comptes comme ayant une localisation qu’il ne peut pas vérifier. L’extension le signale par un badge ⚠ VPN à côté du drapeau. Cela signifie que X lui-même doute du pays, pas qu’un VPN est prouvé.',
        },
        {
          q: 'Puis-je masquer ou replier les tweets de certains pays ?',
          a: 'Oui. Choisissez les pays ou régions dans la page d’options et décidez si les tweets concernés se replient derrière un bouton « Afficher » ou disparaissent entièrement. Le repli est le comportement par défaut, si bien que rien n’est jamais retiré silencieusement de votre fil.',
        },
        {
          q: 'Puis-je filtrer sur autre chose que le pays ?',
          a: 'Oui. Vous pouvez bloquer tous les comptes que X rattache à une organisation, marquer les comptes plus récents qu’un seuil de votre choix, et surligner les comptes dont le nom ou la bio correspond à vos mots-clés — ou dont la bio est surtout composée d’emojis de drapeau. Les règles d’ancienneté et de mot-clé ne font que marquer un message ; elles ne le retirent jamais. Une liste blanche et des exceptions par règle couvrent les comptes que vous souhaitez épargner.',
        },
        {
          q: 'Cela nécessite-t-il mon mot de passe X ou une clé API ?',
          a: 'Ni l’un ni l’autre. L’extension utilise la session X déjà ouverte dans votre navigateur pour faire la même requête que le site quand il vous montre un profil. Pas de connexion, pas de clé API, et aucun compte chez nous.',
        },
        {
          q: 'La localisation est-elle exacte ?',
          a: 'Elle est exactement aussi fiable que les données de X, puisque ce sont les données de X. L’extension ne devine rien à partir d’une adresse IP et ne consulte aucune base externe. Là où X signale une localisation comme non vérifiée, l’extension fait de même.',
        },
      ],
    },

    aboutThisAccount: {
      title: 'X « À propos de ce compte » : comment y accéder, et plus vite',
      description:
        'X indique le pays de chaque compte sous « À propos de ce compte » — un profil à la fois, derrière un menu. Voici où le trouver, et comment l’obtenir directement en ligne.',
      faq: [
        {
          q: 'Qu’est-ce que « À propos de ce compte » sur X ?',
          a: 'Un panneau ajouté par X qui indique où un compte est basé, quand il a été créé, combien de fois il a changé de pseudo, et par quelle boutique d’applications il est passé. C’est exactement le champ « pays » que lit cette extension.',
        },
        {
          q: 'Où se trouve « À propos de ce compte » ?',
          a: 'Ouvrez un profil, touchez le menu ⋯ en haut à droite de l’en-tête, et choisissez « À propos de ce compte ». Sur le web, c’est dans le même menu à côté du bouton Suivre.',
        },
        {
          q: 'Pourquoi « À propos de ce compte » n’apparaît-il pas pour certains ?',
          a: 'X ne renvoie pas de pays pour tous les comptes — les plus anciens ou les moins actifs n’ont souvent rien d’enregistré. Quand le champ est réellement vide, aucun outil ne peut le remplir, y compris celui-ci.',
        },
        {
          q: 'Comment voir le pays sans ouvrir chaque profil ?',
          a: 'C’est exactement ce que cette extension permet. Elle lit le même champ et l’affiche sous forme de drapeau dans la carte de survol et, en option, en ligne dans le fil — parcourir un fil de quatre-vingts réponses ne nécessite donc plus quatre-vingts détours par un menu.',
        },
      ],
    },

    engagementFarming: {
      title:
        'Comment repérer l’engagement farming et le spam de réponses sur X',
      description:
        'Les signaux qui distinguent une vraie réponse d’une réponse fabriquée sur X : ancienneté du compte, rapport abonnés/abonnements, habitudes de publication, et pays réel du compte.',
      faq: [
        {
          q: 'Qu’est-ce que l’engagement farming sur X ?',
          a: 'Publier des réponses conçues pour récolter des impressions plutôt que pour dire quelque chose — approbation générique, indignation recyclée, ou phrase toute faite collée sous le message qui fait le buzz. Depuis que X rémunère les impressions, la motivation financière est directe.',
        },
        {
          q: 'Comment savoir si une réponse X vient d’un bot ou d’une ferme ?',
          a: 'Aucun signal isolé n’est concluant. Les signaux utiles se cumulent : un compte abonné à des milliers de comptes alors qu’il est suivi par des dizaines, créé il y a quelques semaines, répondant en quelques secondes à de gros comptes, avec une bio pleine de drapeaux et d’emojis. Un seul de ces signaux est banal ; trois ensemble, rarement.',
        },
        {
          q: 'Quel rapport abonnés/abonnements trahit un compte fabriqué ?',
          a: 'Suivre bien plus de comptes qu’on n’est suivi — un rapport nettement inférieur à 0,1 — est le schéma classique, parce que s’abonner en masse est le moyen le moins coûteux de se faire remarquer. Beaucoup de nouveaux comptes ordinaires ont le même profil, alors traitez cela comme un élément parmi d’autres, pas comme un verdict.',
        },
        {
          q: 'L’extension détecte-t-elle l’engagement farming ?',
          a: 'Pas directement. Ce qu’elle fait, c’est afficher en ligne le pays du compte et son statut VPN, soit le seul signal que vous ne pouvez absolument pas voir sans ouvrir chaque profil. Les autres signaux de cette page restent une appréciation qui vous appartient.',
        },
      ],
    },

    rateLimit: {
      title: 'La limite de X : 50 consultations de profil par 15 minutes',
      description:
        'X autorise environ 50 consultations de compte par navigateur toutes les 15 minutes. Comment X-Pat rationne cette fenêtre, et pourquoi la plupart des profils n’en coûtent aucune.',
      faq: [],
    },

    comparison: {
      title:
        'Alternative à X-Posed : X-Pat comparé, fonctionnalité par fonctionnalité',
      description:
        'Une comparaison honnête de X-Pat avec X-Posed et les deux autres extensions de localisation X les plus installées — y compris les trois domaines où X-Posed fait mieux.',
      faq: [
        {
          q: 'Quelle est la meilleure alternative à X-Posed ?',
          a: 'Cela dépend de vos besoins. X-Posed est l’option la plus établie et dispose d’un filtre par langue, de versions Firefox et d’une application iPhone que X-Pat n’a pas. X-Pat se distingue sur le cache partagé : son serveur est publié et auto-hébergeable, les entrées du cache sont recoupées entre installations avant d’être servies, et les consultations ne portent aucun identifiant qui permettrait au serveur de dresser un profil de ce que vous avez regardé.',
        },
        {
          q: 'X-Pat est-il open source ?',
          a: 'Oui, sous licence MIT, tout comme le serveur de cache auquel il se connecte — les deux se trouvent dans le même dépôt, avec une documentation de déploiement pour Cloudflare Workers et pour un simple VPS. X-Posed publie aussi son extension sous MIT ; ce qu’il ne publie pas, c’est le Worker qui reçoit les contributions au cache communautaire.',
        },
        {
          q: 'Ces extensions ont-elles besoin de mon mot de passe X ?',
          a: 'Aucune de celles comparées ici. Elles utilisent la session X déjà ouverte dans votre navigateur pour faire la même requête que X quand il vous affiche un profil. Pas de connexion, pas de clé API, pas de compte tiers.',
        },
        {
          q: 'Pourquoi le drapeau cesse-t-il d’apparaître au milieu d’un fil ?',
          a: 'X autorise environ cinquante consultations de comptes par navigateur et par quart d’heure, et un fil actif contient davantage de comptes. Les extensions qui atteignent le plafond arrêtent simplement de remplir les drapeaux. C’est le cache partagé qui l’évite — la plupart des profils ne coûtent aucune consultation parce que quelqu’un d’autre les a déjà résolus — et X-Pat réserve en plus les vingt derniers pour cent de la fenêtre aux comptes que vous survolez vous-même.',
        },
      ],
    },
  },
}
