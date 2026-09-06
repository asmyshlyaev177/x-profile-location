import type { Dict } from './en'

/**
 * Filipino. Conversational Taglish where that is genuinely the register — the
 * English technical terms below (browser, cache, extension, timeline) are what
 * Filipino speakers actually say; translating them would read as stilted.
 */
export const fil: Dict = {
  nav: {
    sections: 'Sections',
    screenshots: 'Screenshots',
    howItWorks: 'Paano gumagana',
    features: 'Features',
    privacy: 'Privacy',
    comparison: 'Paghahambing',
    sourceOnGitHub: 'Source sa GitHub',
    home: 'X-Pat — home',
  },

  language: {
    label: 'Wika',
    choose: 'Pumili ng wika',
  },

  install: {
    chrome: 'Idagdag sa Chrome',
    edge: 'Idagdag sa Edge',
    brave: 'Idagdag sa Brave',
  },

  hero: {
    titleLead: 'Tingnan kung saan ba',
    titleAccent: 'talaga galing ang X profile',
    lead: 'Alam na ng X kung anong bansa nagpo-post ang isang account. Hindi lang nila pinapakita. Nilalagay nito ang flag sa hover card, at puwede mong i-collapse o itago ang mga bansang ayaw mo nang makita.',
    seeItRunning: 'Panoorin gumana',
    railWorksIn: 'Gumagana sa',
    railAndroid: 'Sa Android',
    railAccount: 'Account / API key',
    railAccountValue: 'Wala sa dalawa',
    railVersion: 'Version',
    panelFollowing: 'Following',
    panelFollowers: 'Followers',
    panelHidden: '🚫 Nakatago · 🇮🇳 India',
    panelShow: 'Ipakita',
  },

  screenshots: {
    heading: 'Ito na, tumatakbo sa loob mismo ng X.',
    lead: 'Screenshots mula sa ordinaryong timeline. Pumili ng isa para makita mo kung paano gumana.',
    fullSize: 'Full size',
    viewer: 'Screenshot viewer',
    close: 'Isara',
    prev: 'Nakaraang screenshot',
    next: 'Susunod na screenshot',
    railLabel: 'Screenshots',
    shots: {
      copy: {
        label: 'Kopyahin bilang larawan',
        alt: 'Hover card na may mga button na Post at Tungkol sa tabi ng bandila, at katabi ang kinopyang pahinang Tungkol sa account bilang larawan',
      },
      hover: {
        label: 'Flag pagka-hover',
        alt: 'Isang X hover card na may flag ng Germany at salitang Germany sa ilalim ng handle',
      },
      vpn: {
        label: 'Babala sa VPN',
        alt: 'Isang hover card na may flag ng US sa tabi ng pulang ⚠ VPN badge',
      },
      feed: {
        label: 'Flags sa timeline',
        alt: 'Isang timeline kung saan may dalang country flag ang bawat author, hindi na kailangan i-hover',
      },
      blocked: {
        label: 'Nakatago sa feed',
        alt: 'Isang timeline kung saan nakatiklop ang isang post sa likod ng “🚫 Nakatago · Egypt” na bar at isang Show na buton',
      },
      keyword: {
        label: 'Highlight sa keyword',
        alt: 'Isang tweet na naka-highlight ng amber dahil tumugma ang bio ng author sa naka-save na keyword',
      },
      flagBios: {
        label: 'Bio na siksik sa flag',
        alt: 'Isang account na na-flag dahil nagsiksik ng ilang country flag sa bio',
      },
      swipe: {
        label: 'Swipe sa phone',
        alt: 'Isang timeline na kasing-lapad ng phone na may swipe-right gesture para ipakita ang bansa ng author bilang overlay',
      },
    },
  },

  howItWorks: {
    heading: 'Kung saan talaga galing ang flag',
    lead: 'Bawat account sa X ay may nakasave na bansa. Tinatago lang ng X sa likod ng menu na halos walang nagbubukas. Walang nanghuhula ng IP address dito o nagtatanong sa kahit anong outside database.',
    steps: {
      hover: {
        title: 'Mag-hover ka ng profile',
        body: 'O mag-swipe pakanan sa tweet, kung naka-phone ka. Walang settings page na bubuksan muna; nangyayari ang lookup kung nasaan na ang cursor mo.',
        readoutKey: 'Trigger',
        readoutValue: 'hover · swipe · timeline',
      },
      ask: {
        title: 'Diretsong nagtatanong ang browser mo sa X',
        body: 'Ginagamit nito ang session na nasa browser mo na para gawin ang kaparehong request na ginagawa ng site kapag pinapakita ang isang account. Walang kahit ano samin na nasa pagitan.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Lalapag ang flag sa card',
        body: 'Tatagalin ng browser mo ang sagot nang 30 araw, kaya libre na ang pangalawang tingin. May button sa options page para i-clear.',
        readoutKey: 'Cache',
        readoutValue: 'local · 30 araw',
      },
    },
  },

  rateBudget: {
    link: 'Paano gumagana ang budget',
    heading: 'Ang rate limit ng X, nireresolba sa halip na binabangga.',
    lead: 'Nakita mo na ang palya. Napupuno ang taas ng thread, tapos biglang wala na. Iyon ang limit: limampung account lookup kada labinlimang minuto, at mas marami pa diyan ang accounts sa isang busy na thread.',
    body: 'Karamihan ng profile dito walang gastos na lookup. Nasa cache na sila, o may ibang naghanap na at ang shared cache na ang sumasagot. Ang natitira, nirarasyon.',
    closing:
      'Kahit maubos mo, countdown hanggang reset ang makukuha mo, hindi blankong flag. Parehong puwedeng baguhin ang bahagi at ang pacing.',
    facts: {
      real: {
        title: 'Ang totoong numero',
        body: 'Galing sa sariling response headers ng X ang budget, hindi sa hulang pinako noong build. Pati mga hover mo, binabawas doon.',
        readoutKey: 'Source',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Sinusukat, hindi sinusugod',
        body: 'Mga isang lookup kada 21 seconds, nire-recompute sa tuwing kailangan — humahabà kapag madalas kang mag-hover, humihigpit kapag napupuno uli ang window.',
        readoutKey: 'Pace',
        readoutValue: 'window ÷ budget',
      },
      hovers: {
        title: 'Laging panalo ang hover',
        body: 'Humihinto sa 85% ang background work, kaya nandiyan pa ang natitirang window para sa mga account na talagang tinututukan mo.',
        readoutKey: 'Nakareserba',
        readoutValue: '8 sa 50',
      },
    },
    bar: {
      caption: 'Isang 15-minutong window',
      alt: 'Limampung lookup kada window: apatnapu’t dalawa ang puwede para sa background prefetching, walo ang nakareserba para sa mga ina-hover mong account.',
      backgroundNote:
        'background, dahan-dahang binibitawan sa buong labinlimang minuto',
      reservedNote:
        'nakareserba, para ang hover ay hindi kailanman maging request na uubos sa iyo',
    },
  },

  features: {
    heading: 'Isang linya ng impormasyon, at kung anong gagawin mo doon.',
    lead: 'Gumagana lahat sa hover card, profile pages, single tweets at sa timeline. Walang kailangang i-set up muna.',
    readings: {
      country: {
        name: 'Bansa',
        body: 'Ang bansa kung saan nagpo-post ang account. Lumalabas sa hover card, at pati sa timeline kapag in-on mo.',
      },
      region: {
        name: 'Rehiyon',
        body: 'Minsan region ang ibinabalik ng X imbes na bansa. Makukuha mo ang short code: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'Minsan mina-markahan ng X ang isang lokasyon bilang posibleng hindi accurate. Ipinapakita pa rin ang bansa; alam mo lang na dapat bawasan ang tiwala mo roon.',
      },
      registration: {
        name: 'Registration',
        body: 'Kung saang app store ginawa ang account. Kadalasan ito ang mas reliable sa dalawang signal.',
      },
      cooldown: {
        name: 'Cooldown',
        body: 'May cap ang X kung ilang lookup ang makukuha mo sa loob ng 15 minuto. Pag sumagad ka, may countdown na magsasabi kung kailan ito aalisin, sa halip na iwan kang nagtataka kung bakit hindi lumabas ang flag.',
      },
    },
    hide: {
      title: 'Itago ang mga bansang ayaw mong makita.',
      p1: 'Kapag nakikita mo na kung saan galing ang isang post, may magagawa ka na. Piliin ang mga lugar na gusto mong laktawan at pumili kung ano ang mangyayari sa tweets nila.',
      p2: 'Ang collapse ang default. Nagiging slim bar ang tweet — <b>🚫 Nakatago · 🇮🇳 India</b> — na may Ipakita button, kaya alam mo pa ring mayroon doon, at isang click ay ibabalik ito nang tuluyan. Sinusundan ng filter ang country ng app store kapag mayroon, at hindi ginagalaw ang tweet na sinadya mong buksan.',
      p3: 'Hindi lang bansa ang hawak mo. I-block ang isang organisasyon at lahat ng account na bina-badge ng X na kabilang doon ay mawawala rin, habang ang mga account na mas bata sa threshold na ilalagay mo ay mamamarkahan kapa-labas pa lang — minamarkahan, hindi kailanman tinatago, dahil ang pagiging bago ay hindi patunay ng kahit ano.',
      readoutCollapse: 'Collapse',
      readoutCollapseValue: 'Slim bar + Ipakita',
      readoutHide: 'Itago',
      readoutHideValue: 'Tinatanggal agad',
      readoutOff: 'Off',
      readoutOffValue: 'Flags lang',
      previewRemoved: 'tinanggal ang tweet',
    },
    highlight: {
      title: 'Markahan ang accounts na gusto mong makita agad mula sa malayo.',
      p1: 'Mag-save ng ilang keyword at bawat tweet na may author na tumugma ay magkakaroon ng amber na outline, na may naka-print na katugmang salita katabi ng handle. Ang mga bio na puno ng flag ay nahuhuli sa parehong paraan, sa bilang na sa tingin mo ay sobra na.',
      p2: 'Nasa options page ng extension ang mga rules, kasama ang mga exception: isang allowlist para sa mga account na hindi puwedeng galawin ng kahit anong rule, at per-rule exemptions para sa account na gusto mong hindi tamaan ng keyword pero tamaan ng bansa.',
      readoutMatch: 'Tumutugma sa',
      readoutMatchValue: 'Pangalan · bio',
      readoutFlags: 'Bilang ng flag',
      readoutFlagsValue: 'Threshold mo',
      readoutExceptions: 'Mga exception',
      readoutExceptionsValue: 'Per account',
      optionsTitle: 'Options',
      optionsSaved: 'na-save',
      optionsByKeyword: 'I-highlight ayon sa keyword 🔍',
      optionsByFlags: 'I-highlight ayon sa flags 🏴',
      optionsPlaceholder: 'Mag-type ng keyword…',
    },
    cache: {
      title: 'Cache na pinupuno ng lahat',
      p1: 'Ang flags na hinahanap mo at flags na hinahanap ng iba ay napupunta sa iisang pool, kaya karamihan ng profile ay bumabalik agad imbes na gumamit ng isang lookup mo. Ang public handle at flag lang nito ang lumalabas kahit saan. Hindi kasama ang account mo, cookies, bio at history.',
      p2: 'Isang toggle ang nagpapatay nito, at ang pagpatay nito ay humihinto rin sa lahat ng background lookup. Pagkatapos niyan, wala nang kausap ang extension kundi X, at kapag ikaw lang ang humingi.',
      contributors: 'nag-contribute',
      shared: 'na-share',
      instant: '⚡ instant',
    },
    swipe: {
      title: 'At sa phone, isang swipe lang',
      p1: 'Mag-swipe pakanan sa kahit anong tweet para makuha ang lokasyon ng author nito. Umaandar ito sa kalagitnaan pa lang ng swipe imbes na hintayin kang iangat ang daliri, at may overlay na magsasabi ng bansa.',
      p2: 'Sa Android, kailangan mo ng browser na nagpapatakbo ng desktop extensions. <b>{browser}</b> ang ginamit sa pag-test nito.',
    },
  },

  trust: {
    heading:
      'Ang extension na nagbabasa ng X session mo dapat ay tiyak magsalita.',
    lead: 'Kaya heto. Diretsong pumapasok sa x.com ang mga lookup, kapareho ng sariling request ng site, at hindi kailanman dumadaan sa server namin. Hawak ng browser mo ang resulta nang 30 araw, at nililinis ito ng options page kahit kailan mo gusto.',
    body: 'Walang analytics o telemetry sa loob ng extension. Ang website na ito ay gumagamit ng Google Analytics, para sa bilang ng bisita at kung aling install button ang na-click — wala nang iba.',
    readPolicy: 'Basahin ang buong privacy policy',
    neverTitle: 'Hindi kailanman ipinapadala kung saan',
    neverNote:
      'Walang setting para dito. Hindi kailanman binabasa ng extension.',
    never: [
      'Ang X account mo, cookies o session tokens',
      'Mga bio, display name, o kahit anong binabasa mo',
      'Ang browsing history mo o activity sa X',
      'Anumang nag-i-identify sa iyo nang personal',
    ],
    optTitle: 'Kapag naka-on lang ang cache',
    optNote:
      'Isang toggle sa options page ang kumukontrol dito. I-off mo, walang lalabas.',
    optional: [
      'Ang public handle na hinanap mo, hal. @jack',
      'Ang flag data nito: lokasyon, source, VPN indicator',
      "Isang random install ID, para ang parehong flag mula sa iba't ibang tao ay minsan lang bilangin",
    ],
  },

  compareTeaser: {
    heading: 'May ginagamit ka na bang iba?',
    lead: 'Mga dalawampung extension ang naglalagay ng flag sa tabi ng handle. Ang mga pagkakaibang may halaga ay wala sa listahan ng features — nasa kung ano ang pinapayagang gawin ng shared cache, at sa kung ano ang nangyayari kapag naubos na ang limampung lookup ng X.',
    body: 'Sinusukat nitong isa ang sarili niyang bilis sa totoong budget na galing mismo sa response headers ng X, at may nakatabing walong lookup para sa mga account na hino-hover mo — kaya natatapos punan ang isang matraping thread sa halip na huminto sa kalagitnaan. Labing-apat na hilera ang sinasaklaw ng buong table at pinapangalanan ang tatlong bagay na mas magaling gawin ng X-Posed kaysa sa extension na ito.',
    link: 'Tingnan ang buong comparison →',
  },

  cta: {
    heading: 'Tama na ang panghuhula kung saan galing ang timeline mo.',
    body: 'Libre, at gumagana sa sandaling ma-install. Walang account na kailangang gawin.',
  },

  faq: {
    heading: 'Mga tanong na talagang tinatanong ng tao',
  },

  footer: {
    tagline:
      'Isang country flag sa bawat X profile, galing sa sariling data ng X. Gawa ng isang tao, walang companya sa likod.',
    version: 'Version',
    notAffiliated:
      'Hindi affiliated sa X Corp. Galing sa sariling public endpoints ng X ang location data.',
    groupExtension: 'Ang extension',
    groupGuides: 'Guides',
    groupSmallPrint: 'Small print',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Suportahan ang project',
    guideAboutAccount: 'X "About this account"',
    guideEngagementFarming: 'Pag-spot ng engagement farming',
    guideRateLimit: 'Rate limit ng X',
    guideComparison: 'Compared sa X-Posed',
    privacyPolicy: 'Privacy policy',
    whatIsNotCollected: 'Ano ang hindi kinokolekta',
    contact: 'Contact',
  },

  table: {
    caption:
      'X-Pat kumpara sa tatlong pinaka-installed na X location extension',
    feature: 'Feature',
    yes: 'yes',
    no: 'no',
    notStated: 'hindi nakasaad',
    notApplicable: 'not applicable',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Nakikita agad ang bansa, hindi na kailangang magbukas ng menu',
        note: 'Binabasa mula sa sariling data ng X na "About this account", hindi hinuhulaan mula sa IP address.',
      },
      signupSource: {
        label: 'Pinagmulan ng sign-up — Apple, Google Play o web',
        note: '',
      },
      accountAge: { label: 'Edad ng account', note: '' },
      handleChanges: { label: 'Bilang ng pagbabago ng handle', note: '' },
      hideByCountry: {
        label: 'Itago o i-collapse ayon sa bansa at rehiyon',
        note: 'Ang pag-collapse sa likod ng button na "Ipakita" ang default dito, dahil ang timeline na tahimik na nagtatapon ng post ay timeline na hindi mo maa-audit.',
      },
      allowlist: {
        label: 'Always-show allowlist at per-rule exceptions',
        note: '',
      },
      budgetFromHeaders: {
        label:
          'Sinusukat ang bilis sa totoong budget mula sa rate-limit headers ng X',
        note: 'Binabasa ng X-Pat ang mga x-rate-limit header sa bawat tugon at ikinakalat ang mga lookup nito sa natitira sa window, na may bahaging nakatabi para sa mga account na hino-hover mo. Ang X-Posed ay nasa nakapirming 150 ms na agwat na may walong sabay na request, at binabasa lang ang reset header kapag tumama na ang 429.',
      },
      sharedCache: {
        label: 'Shared cache, para makalusot ang flags sa rate limit',
        note: 'Pinapayagan ng X ang isang browser ng mga 50 profile lookup kada 15 minuto. Kung walang shared cache, iyang ceiling na iyan ang buong experience.',
      },
      cacheServerSource: {
        label: 'Naka-publish ang source ng cache server',
        note: 'Ang server na tumatanggap ng contributions, hindi lang ang extension na nagpapadala. Ang sa amin ay nasa parehong repo, may deploy docs — puwede mong basahin, o magpatakbo ng sarili mo.',
      },
      crossChecked: {
        label:
          'Ang naka-cache na entries ay cross-checked sa pagitan ng installs',
        note: 'Ang sa amin ay nagtatago ng per-install votes at ang consensus ang inihahain, may confidence threshold na puwede mong taasan. Ang X-Posed ay nagdodokumento ng pag-store ng huling accepted value para sa isang handle.',
      },
      extensionSource: {
        label: 'Naka-publish ang source ng extension',
        note: '',
      },
      testSuite: {
        label: 'Automated test suite sa loob ng repo',
        note: 'Unit, end-to-end laban sa recorded traffic, at visual regression. Ang numero ay kung ano ang pinapatakbo ng CI sa bawat push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'iPhone / iPad companion app', note: '' },
    },
    losses: {
      mature: {
        title: 'Ang X-Posed ang mas mature',
        body: 'Mga 10,000 Chrome installs kumpara sa iilan lang namin, apat na buwan na mas nauna, at community cache na may milyon-milyong profile habang ang sa amin ay libo-libo. Ang mas malaking cache ay talagang ibig sabihin ay mas maraming instant flags sa day one. Tunay na advantage iyan at hindi hamak na mas malaki.',
      },
      surfaces: {
        title: 'Mas marami itong platform',
        body: 'Firefox sa desktop, Firefox para sa Android, at isang companion iPhone app. Ang X-Pat ay Chromium lang sa ngayon — Chrome, Edge, Brave, at Quetta sa Android. Plano ang Firefox, ang iOS ay hindi.',
      },
      languageFilter: {
        title: 'May language filter ito',
        body: 'Wala kami, at sinadya iyon. Ang per-post language field ng X ay sapat nang madalas mali para ang pagsala rito ay magpawala ng mga post nang walang nakikitang dahilan. Depensableng desisyon iyon sa halip na missing feature — pero kung ang pagsala sa wika ang pinunta mo rito, nasa X-Posed iyon at wala sa amin.',
      },
    },
    notApplicable: '—',
    testCount: '{count} tests',
    none: 'wala',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Guide',
      titleLead: 'Ang',
      titleAccent: '"About this account"',
      titleRest: ' ng X, at kung paano tumigil sa pag-click para dito.',
      lead: 'Tahimik na alam ng X kung anong bansa nagpo-post ang bawat account, at sasabihin naman nito sa iyo — isang profile kada beses, tatlong tap ang lalim, kung ilang profile ang kaya ng pasensiya mo. Heto kung saan ang panel, kung ano ang kaya at hindi kaya nitong sagutin, at kung anong gagawin kapag gusto mo ang parehong katotohanan para sa walumpung reply imbes na isa.',
      whereHeading: 'Kung saan talaga ang panel',
      steps: {
        web: {
          where: 'Web',
          body: 'Buksan ang profile, tapos ang ⋯ overflow menu na nasa tabi ng Follow button. Nasa listahang iyon ang "About this account".',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Buksan ang profile at i-tap ang ⋯ sa kanang itaas ng header. Parehong entry, parehong panel.',
        },
        what: {
          where: 'Ano ang makukuha mo',
          body: 'Ang bansang kinalalagyan ng account, tinatayang kung kailan ito sumali, ilang beses nagbago ang handle, at kung saang app store ito nag-sign up.',
        },
      },
      cantHeading: 'Ano ang hindi nito kayang sagutin',
      cant1:
        'Ang panel ay per-profile at modal. Ayos lang iyan kapag nagsu-survey ka ng isang account, at walang silbi kapag nagbabasa ka ng reply thread, na siya namang sandali kung kailan kadalasang lumilitaw ang tanong. Isang daang reply ay isang daang balikan sa menu, at pagsapit ng ikatlo ay nawala na sa iyo ang thread na binabasa mo.',
      cant2:
        'Hindi rin ito laging populated. Walang ibinabalik na bansa ang X para sa hindi kakaunting accounts — kadalasan ay ang mas luma o halos walang activity. Kapag talagang walang laman ang field, wala naming maibubunyag, at kahit anong tool na nagsasabing mayroon ay nanghuhula lang ng IP address.',
      cant3:
        'At wala itong sinasabi tungkol sa confidence. Sa internal, minamarkahan ng X ang ilang lokasyon bilang hindi nito kayang panindigan; ipinapakita pa rin ng panel ang bansa.',
      sameHeading: 'Ang parehong field, walang menu',
      same1:
        'Binabasa ng X-Pat ang eksaktong field na binabasa ng panel — ang parehong endpoint, gamit ang X session na nasa browser mo na — at iginuguhit ito bilang flag sa hover card, at opsiyonal na inline sa timeline. Walang IP lookup, walang third-party database, walang account o API key.',
      same2:
        'Tatlong bagay ang inilalabas nito mula sa response na iyon: ang bansa, ang app store kung saan nag-sign up ang account, at kung minamarkahan ba ng X ang lokasyon bilang hindi nito ma-verify — ang confidence signal na iniiwan ng panel. Ang join date at handle history ay nananatili kung saan sila naroon; hindi sinusubukan ng extension na maging buong panel.',
      same3:
        'Puwede ka ring kumilos batay dito: ang mga bansa at rehiyon na ayaw mong makita ay puwedeng mag-collapse sa likod ng button na "Ipakita", o itago. Ang collapse ang default, dahil ang timeline na tahimik na nagtatapon ng post ay timeline na hindi mo mapagkakatiwalaan.',
    },

    engagementFarming: {
      kicker: 'Guide',
      titleLead: 'Paano ma-spot ang',
      titleAccent: 'engagement farming',
      titleRest: ' sa X.',
      lead: 'Simula nang magsimulang magbayad ang X base sa impressions, naging trabaho ang pag-reply. Hindi trabahong malaki ang bayad, at iyon mismo ang dahilan kung bakit ganoon ang hitsura ng lumalabas: mabilisan, generic, at idinidikit sa ilalim ng kung ano mang trending. Heto ang mga signal na talagang naghihiwalay ng tunay na reply sa farmed na reply.',
      noVerdictHeading: 'Walang iisang signal ang sapat na hatol',
      noVerdict1:
        'Bawat palatandaan sa ibaba ay may inosenteng paliwanag. Ang mga bagong account ay bago nga. May mga taong generous mag-follow. Maraming maaayos na nagpo-post ang may emoji sa bio. Kapag tinuring mong patunay ang kahit alin sa mga ito, isusulat-off mo ang mga ordinaryong estranghero, na parehong hindi maganda at nakakainip.',
      noVerdict2:
        'Ang gumagana ay ang pagsasalansan. Isang account na tatlong linggo pa lang ang edad, nagfa-follow ng libo-libo, fina-follow ng ilang dosena, unang-una sa replies na may stock phrase — ang kombinasyong iyon ay hindi pagkakataon lang, at mababasa mo ito nang mga dalawang segundo kapag alam mo na kung saan titingin.',
      colSignal: 'Signal',
      colTell: 'Ano ang itsura',
      colCost: 'Gastos i-check',
      signals: {
        ratio: {
          signal: 'Follower / following ratio',
          tell: 'Nagfa-follow ng 4,000, fina-follow ng 40',
          cost: 'Isang sulyap sa hover card',
        },
        age: {
          signal: 'Edad ng account',
          tell: 'Sumali tatlong linggo pa lang, malalim na sa political threads',
          cost: 'Hover card',
        },
        latency: {
          signal: 'Bilis ng reply',
          tell: 'Unang reply sa loob ng ilang segundo, mula sa account na walang kahit anong history sa author',
          cost: 'Timestamp, kung pakikinggan mo',
        },
        bio: {
          signal: 'Komposisyon ng bio',
          tell: 'Isang hanay ng flags at emoji kung saan dapat may pangungusap',
          cost: 'Libre — nakalantad lang',
        },
        substance: {
          signal: 'Nilalaman ng reply',
          tell: 'Ang kaparehong stock phrase na nakita mo na sa ilalim ng apat na iba pang post ngayong araw',
          cost: 'Memorya, kadalasan',
        },
        location: {
          signal: 'Kung saan nakabase ang account',
          tell: 'Kumpiyansang nagle-lecture tungkol sa bansang hindi pa napo-post-an ng account',
          cost: 'Tatlong tap, bawat profile — o inline',
        },
      },
      hiddenHeading: 'Ang hindi mo nakikita',
      hidden1:
        'Lima sa anim na signal sa itaas ay nasa screen na. Follower counts, join date, ang bio, ang reply mismo — lahat iyan ay ibinibigay ng X nang hindi hinihingi. Ang ikaanim ay ang itinatago ng X sa likod ng menu: kung saan talaga nagpo-post ang account.',
      hidden2:
        'Mas mahalaga ito kaysa sa iba para sa isang partikular na klase ng inis — hindi eksaktong spam, kundi kumpiyansang pagtuturo tungkol sa lugar na walang kinalaman sa account. Iba talaga ang pagbasa niyan kapag nakikita mo ito, at pinapabukas sa iyo ng X ang panel kada profile para malaman.',
      hidden3:
        '<b>Iyan ang ginagawa ng X-Pat.</b> Inilalagay nito ang bansa sa hover card at, kung gusto mo, inline sa timeline — kasama ang babala kapag ang X mismo ay hindi ma-verify ang lokasyon. Hindi nito sini-score ang mga account o hinahatulan ang replies para sa iyo; ang limang natitirang signal ay ikaw pa rin ang bahala. Pinipigilan lang nitong ang isang talagang nakatagong katotohanan ay gumastos ng tatlong tap.',
    },

    comparison: {
      kicker: 'Comparison',
      titleLead: 'X-Pat vs',
      titleAccent: 'X-Posed',
      titleRest: ', at ang iba pang nasa shelf.',
      lead: 'Mga dalawampung extension ang naglalagay ng country flag sa tabi ng X handle. Tatlo sa kanila ang may makabuluhang bilang ng users. Heto kung ano ang aktuwal na ginagawa ng bawat isa, kung ano ang ginagawa ng X-Pat na iba, at ang tatlong bagay na mas magaling gawin ng X-Posed — na siyang bahaging iniiwan ng karamihan sa mga comparison page.',
      featureHeading: 'Feature kada feature',
      featureLead:
        'Bawat cell ay galing sa public store listing o public repository, binasa noong {date}. Ang dash ay nangangahulugang hindi ito sinasabi ng listing — para sa dalawang closed-source na extension, hindi iyon kapareho ng no, at magiging unfair na iguhit ito nang ganoon.',
      aheadHeading: 'Kung saan nangunguna ang X-Posed',
      differsHeading: 'Ano talaga ang pagkakaiba',
      differs1:
        'Ang lahat sa kategoryang ito ay nakasalalay sa shared cache. Pinapayagan ng X ang isang browser ng mga limampung profile lookup bawat labinlimang minuto, at ang isang busy na thread ay may mas marami pang accounts kaysa riyan — kaya bawat extension dito na patuloy na gumagana lampas sa limit ay ginagawa iyon sa pamamagitan ng pagbasa ng cache na pinuno ng ibang tao. Ang tanong ay hindi kung may server. Ang tanong ay kung ano ang pinapayagang gawin ng server na iyon.',
      differs2:
        '<b>Ang sa amin ay naka-publish, at puwede kang magpatakbo ng sarili mo.</b> Ang cache server ay nasa parehong repositoryo ng extension, may deploy docs para sa parehong Cloudflare Workers at plain VPS. Naka-publish ang X-Posed ng extension nito — totoo, at under MIT — pero hindi ang Worker kung saan ipinapadala ang contributions. Iyan ang piyesang hindi mo masi-check sa pamamagitan ng pagbabasa ng code na in-install mo.',
      differs3:
        '<b>Ang naka-cache na sagot dito ay kailangan ng corroboration.</b> Ang mga contribution ay ini-store bilang per-install votes at ang consensus ang inihahain, may confidence threshold na puwede mong taasan sa options page. Ang sariling dokumentasyon ng X-Posed ay naglalarawan ng pag-store ng huling accepted value para sa isang handle, na ibig sabihin ay ang pinakahuling contributor ang nagdedesisyon. Parehong disenyo ay tapat tungkol sa parehong underlying problem: walang server ang makakapagpatunay na ang isang contribution ay talagang galing sa X.',
      differs4:
        '<b>Walang dalang identifier ang mga lookup.</b> Ang mga reads ay isang unsigned list ng handles, kaya walang pag-uugnayin ang server at hindi nito mabubuo ang "tiningnan ng install na ito ang mga account na ito". Ang pagbilang ng readers ay aabutin ng isang linya at wawakasan ang property na iyon, kaya sinadya ang published stats na mag-under count.',
      differs5:
        'At ang rate limit ay nirarasyon imbes na pinag-uunahan: humihinto ang background work sa eighty-five percent ng window, kaya ang huling walong lookup ay nariyan pa rin para sa mga account na talagang hino-hover mo. <a href="{href}">Ang mekanismo ay iginuhit sa homepage</a>.',
      sourcesHeading: 'Mga source',
      sourcesLead:
        'Binasa noong {date}. Nagbabago ang install counts at features; kung may outdated man sa ibaba, error iyon at hindi posisyon, at ang <a href="{href}">issue tracker</a> ang pinakamabilis na paraan para maitama ito.',
      sourceLabel: ' — source: ',
      sourceNotPublished: ' — hindi naka-publish ang source',
    },
  },

  pages: {
    home: {
      title:
        'X-Pat — X Profile Location: tingnan ang bansa ng kahit anong X profile',
      description:
        'Isang country flag sa bawat X profile, mula sa sariling data ng X. May VPN warnings, at itago o i-highlight ang posts ayon sa bansa, organisasyon, edad o bio keyword. Libre para sa Chrome.',
      faq: [
        {
          q: 'Paano ko makikita kung saang bansa galing ang isang X account?',
          a: 'Nag-store ang X ng bansa para sa bawat account at ipinapakita ito sa ilalim ng "About this account", pero isang profile lang kada beses at kailangan mo pang buksan ang menu. Binabasa ng extension na ito ang parehong field at inilalagay ang flag sa mismong hover card at timeline, kaya nakikita mo ito nang walang kino-click.',
        },
        {
          q: 'Malalaman ko ba kung gumagamit ng VPN ang isang X account?',
          a: 'Minamarkahan ng X ang ilang account bilang may lokasyong hindi nito ma-verify. Ipinapakita ito ng extension bilang ⚠ VPN badge sa tabi ng flag. Ibig sabihin, ang X mismo ang hindi sigurado sa bansa — hindi napatunayan na may VPN.',
        },
        {
          q: 'Puwede ko bang itago o i-collapse ang tweets mula sa ilang bansa?',
          a: 'Oo. Piliin ang mga bansa o rehiyon sa options page at pumili kung ang tumutugmang tweets ay mag-collapse sa likod ng button na "Ipakita" o mawala nang tuluyan. Ang collapse ang default, kaya walang tahimik na inaalis sa timeline mo.',
        },
        {
          q: 'Puwede ba akong mag-filter base sa iba bukod sa bansa?',
          a: 'Oo. Puwede mong i-block ang bawat account na bina-badge ng X bilang kabilang sa isang organisasyon, markahan ang mga account na mas bata sa threshold na pipiliin mo, at i-highlight ang mga account na tumutugma ang pangalan o bio sa keywords mo — o ang bio ay halos puro flag emoji. Ang mga age at keyword rules ay nagmamarka lang ng post; hindi nila tinatanggal. Sinasaklaw ng allowlist at per-rule exceptions ang mga account na gusto mong hindi tamaan.',
        },
        {
          q: 'Kailangan ba nito ang X password ko o API key?',
          a: 'Wala sa dalawa. Ginagamit nito ang X session na nasa browser mo na para gawin ang kaparehong request na ginagawa ng site kapag ipinapakita nito ang isang profile. Walang login, walang API key, at walang account namin.',
        },
        {
          q: 'Accurate ba ang lokasyon?',
          a: 'Eksaktong kasing-accurate ng sariling data ng X, dahil ito mismo ang sariling data ng X. Hindi nanghuhula ang extension mula sa IP address o kumukonsulta sa kahit anong outside database. Kung saan minamarkahan ng X ang lokasyon bilang hindi verified, ganoon din ang ginagawa ng extension.',
        },
      ],
    },

    aboutThisAccount: {
      title:
        'X "About this account": paano ito makikita, at makita nang mas mabilis',
      description:
        'Ipinapakita ng X ang bansa ng bawat account sa ilalim ng "About this account" — isang profile kada beses, nasa likod ng menu. Heto kung saan ito hahanapin, at kung paano makukuha nang inline.',
      faq: [
        {
          q: 'Ano ang "About this account" sa X?',
          a: 'Isang panel na idinagdag ng X na nagpapakita kung saan nakabase ang account, kailan ito sumali, ilang beses nitong pinalitan ang handle, at kung saang app store ito nag-sign up. Iyon din ang parehong country field na binabasa ng extension na ito.',
        },
        {
          q: 'Nasaan ang "About this account"?',
          a: 'Buksan ang isang profile, i-tap ang ⋯ menu sa kanang itaas ng profile header, at piliin ang "About this account". Sa web, nasa parehong overflow menu ito katabi ng Follow button.',
        },
        {
          q: 'Bakit hindi ko makita ang "About this account" para sa ilang users?',
          a: 'Hindi nagbabalik ang X ng bansa para sa bawat account — kadalasan ang mas luma o hindi masyadong active ay walang nakasave. Kapag talagang walang laman ang field, walang tool ang makakapuno niyon, kasama na ito.',
        },
        {
          q: 'Paano ko makikita ang bansa nang hindi binubuksan ang bawat profile?',
          a: 'Iyan mismo ang puwang na sinasara ng extension na ito. Binabasa nito ang parehong field at iginuguhit bilang flag sa hover card at, kung gusto mo, inline sa timeline — kaya ang pag-scan ng thread na may walumpung reply ay hindi na ibig sabihin ay walumpung menu visit.',
        },
      ],
    },

    engagementFarming: {
      title: 'Paano ma-spot ang engagement farming at reply spam sa X',
      description:
        'Ang mga signal na naghihiwalay ng tunay na reply sa farmed na reply sa X: edad ng account, follower ratio, patterns ng pag-post, at kung saan talaga nakabase ang account.',
      faq: [
        {
          q: 'Ano ang engagement farming sa X?',
          a: 'Ang pagpo-post ng replies na dinisenyo para mag-harvest ng impressions imbes na magsabi ng kahit ano — generic na pagsang-ayon, recycled na galit, o stock phrase na idinidikit sa ilalim ng kung aling post ang trending. Simula nang magsimulang magbayad ang X base sa impressions, may direktang pinansyal na motibo na rito.',
        },
        {
          q: 'Paano mo malalaman kung ang isang X reply ay galing sa bot o farm?',
          a: 'Walang iisang signal ang conclusive. Ang mga kapaki-pakinabang ay nagpapatong-patong: isang account na nagfa-follow ng libo-libo habang fina-follow ng ilang dosena, ginawa ilang linggo lang ang nakalipas, nagre-reply sa loob ng ilang segundo sa malalaking account, na may bio na puno ng flags at emoji. Kahit alin sa mga iyon nang solo ay normal; tatlo nang sabay-sabay ay bihirang normal.',
        },
        {
          q: 'Anong follower-to-following ratio ang nagpapahiwatig ng farmed account?',
          a: 'Ang pag-follow ng mas marami pang accounts kaysa sa nagfa-follow pabalik — ratio na malayong mas mababa sa 0.1 — ang klasikong pattern, dahil ang mass-following ang pinakamurang paraan para mapansin. Maraming ordinaryong bagong account ang ganoon din ang hitsura, kaya ituring itong isang input sa halip na hatol.',
        },
        {
          q: 'Nade-detect ba ng extension ang engagement farming?',
          a: 'Hindi direkta. Ang ginagawa nito ay inilalabas ang bansa at VPN status ng account nang inline, na siyang isang signal na hindi mo makikita kung hindi mo bubuksan ang bawat profile. Ang iba pang signal sa page na ito ay ikaw pa rin ang nagde-decide.',
        },
      ],
    },

    rateLimit: {
      title: 'Rate limit ng X: 50 profile lookup kada 15 minuto',
      description:
        'Mga 50 account lookup kada 15 minuto ang pinapayagan ng X sa isang browser. Kung paano hinahati ng X-Pat ang window na iyon, at bakit hindi ito ginagastos ng karamihan sa mga profile.',
      faq: [],
    },

    comparison: {
      title: 'Alternatibo sa X-Posed: X-Pat compared, feature kada feature',
      description:
        'Isang matapat na paghahambing ng X-Pat laban sa X-Posed at sa dalawa pang pinaka-installed na X location extension — kasama ang tatlong bagay na mas magaling gawin ng X-Posed.',
      faq: [
        {
          q: 'Ano ang pinakamahusay na alternatibo sa X-Posed?',
          a: 'Depende sa kailangan mo. Ang X-Posed ang pinaka-established na option at may language filter, Firefox builds at iPhone app na wala sa X-Pat. Naiiba ang X-Pat sa shared cache: naka-publish at puwedeng i-self-host ang server nito, ang naka-cache na entries ay cross-checked sa pagitan ng installs bago i-serve, at walang dalang identifier ang lookups na magagamit ng server para bumuo ng profile ng kung ano ang tiningnan mo.',
        },
        {
          q: 'Open source ba ang X-Pat?',
          a: 'Oo, MIT licensed, at ganoon din ang cache server na kausap nito — parehong nasa iisang repositoryo, may deploy docs para sa Cloudflare Workers at para sa plain VPS. Naka-publish din ang X-Posed ng extension nito under MIT; ang hindi nito naka-publish ay ang Worker na tumatanggap ng community-cache contributions.',
        },
        {
          q: 'Kailangan ba ng mga extension na ito ang X password ko?',
          a: 'Wala sa mga kinumpara rito ang nangangailangan niyon. Ginagamit nila ang X session na nakabukas na sa browser mo para gawin ang kaparehong request na ginagawa ng X kapag ipinapakita nito ang isang profile. Walang login, walang API key at walang third-party account.',
        },
        {
          q: 'Bakit tumitigil ang flag sa gitna ng thread?',
          a: 'Pinapayagan ng X ang isang browser ng mga limampung account lookup bawat labinlimang minuto, at ang isang busy na thread ay mas marami pa riyan ang accounts. Ang mga extension na umaabot sa ceiling ay humihinto na lang sa paglalagay ng flags. Ang shared cache ang umiiwas dito — karamihan ng profile ay walang gastos na lookup dahil may ibang nag-resolve na sa kanila — at ang X-Pat ay nagrereserba pa ng huling dalawampung porsiyento ng window para sa mga account na ikaw mismo ang nag-hover.',
        },
      ],
    },
  },
}
