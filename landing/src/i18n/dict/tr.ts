import type { Dict } from './en'

/** Turkish. "Sen" throughout — "siz" would read as a bank notice. */
export const tr: Dict = {
  nav: {
    sections: 'Bölümler',
    screenshots: 'Ekranlar',
    howItWorks: 'Nasıl çalışıyor',
    features: 'Özellikler',
    privacy: 'Gizlilik',
    comparison: 'Karşılaştırma',
    sourceOnGitHub: "GitHub'da kaynak kod",
    home: 'X-Pat — ana sayfa',
  },

  language: {
    label: 'Dil',
    choose: 'Bir dil seç',
  },

  install: {
    chrome: "Chrome'a ekle",
    edge: "Edge'e ekle",
    brave: "Brave'e ekle",
  },

  hero: {
    titleLead: 'Herhangi bir X profilinin aslında',
    titleAccent: 'nereden olduğunu gör',
    lead: 'X zaten bütün hesapların hangi ülkeden paylaştığını biliyor. Sana göstermiyor, o kadar. Bu eklenti bayrağı hover karta yerleştiriyor, üstelik okumak istemediğin ülkeleri katlayıp gizlemene de izin veriyor.',
    seeItRunning: 'Çalışırken gör',
    railWorksIn: 'Çalıştığı yerler',
    railAndroid: "Android'de",
    railAccount: 'Hesap / API anahtarı',
    railAccountValue: 'Hiçbiri',
    railVersion: 'Sürüm',
    panelFollowing: 'Takip edilen',
    panelFollowers: 'Takipçi',
    panelHidden: '🚫 Gizli · 🇮🇳 Hindistan',
    panelShow: 'Göster',
  },

  screenshots: {
    heading: "Buyur, X'in içinde çalışırken.",
    lead: 'Sıradan bir akıştan ekran görüntüleri. Nasıl çalıştığını görmek için birini seç.',
    fullSize: 'Tam boy',
    viewer: 'Ekran görüntüsü görüntüleyici',
    close: 'Kapat',
    prev: 'Önceki',
    next: 'Sonraki',
    railLabel: 'Ekranlar',
    shots: {
      hover: {
        label: "Hover'da bayrak",
        alt: 'Kullanıcı adının altına Alman bayrağı ve Almanya yazısı eklenmiş bir X kartı',
      },
      vpn: {
        label: 'VPN uyarısı',
        alt: 'ABD bayrağının yanında kırmızı ⚠ VPN rozeti olan bir kart',
      },
      feed: {
        label: 'Akışta bayraklar',
        alt: "Her yazarın ülke bayrağının satır içinde durduğu, hover'a gerek kalmayan bir akış",
      },
      blocked: {
        label: 'Akışta gizlendi',
        alt: 'Bir gönderinin “🚫 Gizli · Mısır” çubuğu ve Göster düğmesi arkasına katlandığı bir akış',
      },
      keyword: {
        label: 'Anahtar kelime vurgusu',
        alt: 'Yazarın biyografisi kayıtlı bir anahtar kelimeyle eşleştiği için kehribar renginde vurgulanmış bir tweet',
      },
      flagBios: {
        label: 'Bayrak dolu biyografiler',
        alt: 'Biyografisine bir sürü ülke bayrağı tıkıştırdığı için işaretlenmiş bir hesap',
      },
      swipe: {
        label: 'Telefonda kaydırma',
        alt: 'Sağa kaydırma hareketiyle yazarın ülkesini üstte gösteren, telefon eninde bir akış',
      },
    },
  },

  howItWorks: {
    heading: 'Bayrak aslında nereden geliyor',
    lead: "X'teki her hesabın kayıtlı bir ülkesi var. X bunu neredeyse kimsenin açmadığı bir menünün arkasında saklıyor. Burada IP tahmini de yok, dış veritabanı sorgusu da.",
    steps: {
      hover: {
        title: 'Bir profilin üzerine geliyorsun',
        body: "Telefondaysan tweet'i sağa kaydırıyorsun. Önceden açman gereken bir ayar sayfası falan yok; sorgu, imlecinin bulunduğu yerde gerçekleşiyor.",
        readoutKey: 'Tetikleyici',
        readoutValue: 'hover · kaydırma · akış',
      },
      ask: {
        title: "Tarayıcın doğrudan X'e soruyor",
        body: 'Zaten tarayıcında açık olan oturumu kullanıp sitenin bir hesabı sana gösterirken yaptığı isteğin aynısını atıyor. Araya bizim hiçbir şeyimiz girmiyor.',
        readoutKey: 'Uç nokta',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Bayrak karta düşüyor',
        body: 'Tarayıcın cevabı 30 gün tutuyor, yani ikinci bakış bedava. Seçenekler sayfasında bunu temizleyen bir düğme var.',
        readoutKey: 'Önbellek',
        readoutValue: 'yerel · 30 gün',
      },
    },
  },

  rateBudget: {
    link: 'Bütçe nasıl işliyor',
    heading: "X'in istek sınırını çarpmak yerine çözdük.",
    lead: "Şu arızayı bilirsin. Thread'in üstü dolar, sonra hiçbir şey dolmaz. Sınır işte o: on beş dakikada elli hesap sorgusu, ki hareketli bir thread'de bundan çok hesap var.",
    body: 'Buradaki profillerin çoğu sorgu bile yakmıyor. Ya önbellekte var zaten, ya da başkası bakmış, ortak önbellek yanıtlıyor. Gerisi zaten karneli.',
    closing:
      'Bitsin bitsin de bitmezse boş bayrak yerine sıfırlanmaya kalan süreyi gösteren bir gerisayım alırsın. Pay da tempon da senin kontrolünde.',
    facts: {
      real: {
        title: 'Gerçek rakam',
        body: "Bütçe X'in kendi yanıt başlıklarından geliyor, build anında gömülen bir tahmin değil. Senin bakışların da oradan düşüyor.",
        readoutKey: 'Kaynak',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Yayılıyor, patlamıyor',
        body: 'Kabaca her 22 saniyede bir sorgu, her seferinde yeniden hesaplanıyor — çok bakınca esniyor, pencere yeniden dolunca sıkılaşıyor.',
        readoutKey: 'Tempo',
        readoutValue: 'pencere ÷ bütçe',
      },
      hovers: {
        title: 'Hover her zaman kazanır',
        body: "Arka plan işi %80'te duruyor, pencerenin geri kalanı gerçekten üzerine gittiğin hesaplara kalsın diye.",
        readoutKey: 'Ayrılan',
        readoutValue: "50'de 10",
      },
    },
    bar: {
      caption: '15 dakikalık tek bir pencere',
      alt: 'Pencere başına elli sorgu: kırkı arka planda ön yüklemeye açık, onu üzerine geldiğin hesaplara ayrılmış.',
      backgroundNote: 'arka plan, on beş dakikaya yayıla yayıla',
      reservedNote:
        'kenarda tutuluyor, bir hover hiçbir zaman seni sıfırlayan istek olmasın diye',
    },
  },

  features: {
    heading: 'Tek satır bilgi ve onunla ne yaptığın.',
    lead: "Hepsi kartlarda, profil sayfalarında, tek tweet'te ve akışta çalışıyor. Önceden kurcalayacağın bir şey yok.",
    readings: {
      country: {
        name: 'Ülke',
        body: 'Hesabın paylaştığı ülke. Kartta gözükür, açarsan akışta da gözükür.',
      },
      region: {
        name: 'Bölge',
        body: 'X arada ülke yerine bölge döner. Kısa kodunu görürsün: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X bazen bir konumu "doğrulanamaz" diye işaretler. Ülke hâlâ gözükür; sadece biraz daha az güveneceğini bilirsin.',
      },
      registration: {
        name: 'Kayıt',
        body: 'Hesap hangi uygulama mağazasından açılmış. İki sinyalden genelde daha güvenilir olanı.',
      },
      cooldown: {
        name: 'Bekleme',
        body: 'X 15 dakikada kaç sorgu yapabileceğini sınırlıyor. Sınıra takılırsan, bayrak niye çıkmadı diye düşünmek yerine gerisayım sınırın ne zaman kalkacağını söylüyor.',
      },
    },
    hide: {
      title: 'Okumak istemediğin ülkeleri gizle.',
      p1: "Bir paylaşımın nereden geldiğini gördüğün an harekete geçebilirsin. Atlamak istediğin konumları seçip tweet'lerine ne olacağını belirle.",
      p2: 'Varsayılan katlamak. Tweet, içinde Göster düğmesi olan ince bir <b>🚫 Gizli · 🇮🇳 Hindistan</b> çubuğuna dönüşüyor; böylece orada bir şey olduğunu hâlâ anlıyorsun ve tek tıkla kalıcı olarak geri geliyor. Filtre varsa uygulama mağazası ülkesini izliyor, bilerek açtığın tweete ise dokunmuyor.',
      p3: "Elindeki tek kulp ülke değil. Bir kurumu engellersen X'in o kuruma bağlı saydığı bütün hesaplar da gider; senin belirlediğin eşikten daha genç hesaplarsa göründükleri anda işaretlenir — işaretlenir, asla gizlenmez, çünkü yeni olmak tek başına hiçbir şeyi kanıtlamaz.",
      readoutCollapse: 'Katla',
      readoutCollapseValue: 'İnce çubuk + Göster',
      readoutHide: 'Gizle',
      readoutHideValue: 'Doğrudan kaldır',
      readoutOff: 'Kapalı',
      readoutOffValue: 'Sadece bayraklar',
      previewRemoved: 'tweet kaldırıldı',
    },
    highlight: {
      title: 'Uzaktan seçmek istediğin hesapları işaretle.',
      p1: "Birkaç anahtar kelime kaydet; yazarı eşleşen her tweet'in kenarı kehribar rengi olur, eşleşen kelimeler kullanıcı adının yanında yazar. Bayrakla doldurulmuş biyografiler de aynı şekilde yakalanır, hangi sayıdan sonrası fazla geliyorsa o eşikle.",
      p2: 'Kurallar eklentinin seçenekler sayfasında, istisnalarıyla birlikte durur: hiçbir kuralın dokunamayacağı hesaplar için bir izin listesi, bir de anahtar kelimeden muaf tutup ülkeden muaf tutmadığın hesaplar için kural başına muafiyetler.',
      readoutMatch: 'Eşleşme alanı',
      readoutMatchValue: 'İsim · biyografi',
      readoutFlags: 'Bayrak sayısı',
      readoutFlagsValue: 'Senin eşiğin',
      readoutExceptions: 'İstisnalar',
      readoutExceptionsValue: 'Hesap bazında',
      optionsTitle: 'Seçenekler',
      optionsSaved: 'kaydedildi',
      optionsByKeyword: 'Anahtar kelimeyle vurgula 🔍',
      optionsByFlags: 'Bayrakla vurgula 🏴',
      optionsPlaceholder: 'Bir anahtar kelime yaz…',
    },
    cache: {
      title: 'Herkesin beslediği bir önbellek',
      p1: 'Senin baktığın bayraklarla başkalarının baktığı bayraklar aynı havuza düşer; profillerin çoğu sorgu harcamak yerine anında gelir. Dışarı çıkan tek şey herkese açık kullanıcı adı ve bayrağı. Hesabın, çerezlerin, biyografiler ve geçmişin dışarı adım atmaz.',
      p2: 'Tek düğmeyle kapanır, kapandığında arka plan sorguları da durur. Ondan sonra eklenti X dışında hiç kimseyle konuşmaz, onu da sadece sen istediğinde yapar.',
      contributors: 'katkıcı',
      shared: 'ortak',
      instant: '⚡ anında',
    },
    swipe: {
      title: 'Telefondaysa tek kaydırma',
      p1: "Yazarın konumunu getirmek için herhangi bir tweet'i sağa kaydır. Parmağını kaldırmanı beklemez, kaydırmanın ortasında tetiklenir ve ülkeyi üstte beliren bir katman söyler.",
      p2: "Android'de masaüstü eklentilerini çalıştıran bir tarayıcı lazım. <b>{browser}</b> test ettiğimiz tarayıcı.",
    },
  },

  trust: {
    heading: 'X oturumunu okuyan bir eklenti açık konuşsun.',
    lead: "Buyur. Sorgular sitenin kendi istekleri gibi doğrudan x.com'a gider, bizim sunucumuzdan asla geçmez. Tarayıcın sonuçları 30 gün tutar, seçenekler sayfası da dilediğin an temizler.",
    body: 'Eklentide analitik veya telemetri yok. Bu site ise ziyaret sayısı ve hangi kurulum düğmesine tıklandığı için Google Analytics kullanıyor — hepsi bu.',
    readPolicy: 'Gizlilik politikasının tamamını oku',
    neverTitle: 'Hiçbir yere gönderilmez',
    neverNote: 'Bunların ayarı yok. Eklenti zaten okumaz.',
    never: [
      'X hesabın, çerezlerin veya oturum jetonların',
      'Biyografiler, görünen adlar veya okuduğun herhangi bir şey',
      "Tarama geçmişin veya X'teki hareketlerin",
      'Seni şahsen tanımlayacak herhangi bir şey',
    ],
    optTitle: 'Sadece önbellek açıkken',
    optNote:
      'Seçenekler sayfasında tek bir düğmeyle yönetiliyor. Kapat, hiçbir şey çıkmaz.',
    optional: [
      'Baktığın herkese açık kullanıcı adı, mesela @jack',
      'Bayrak verisi: konum, kaynak, VPN göstergesi',
      'Rastgele bir kurulum kimliği, aynı bayrak farklı kişilerden gelince tek saysın diye',
    ],
  },

  compareTeaser: {
    heading: 'Zaten başka birini mi kullanıyorsun?',
    lead: 'Yaklaşık yirmi eklenti kullanıcı adının yanına bayrak koyuyor. Asıl fark özellik listesinde değil — ortak önbelleğin neye izni olduğunda ve X’in elli sorgusu bittiğinde ne olduğunda.',
    body: "Bu eklenti hızını X'in kendi yanıt başlıklarındaki gerçek bütçeye göre ayarlıyor ve üzerine gittiğin hesaplar için on sorgu saklı tutuyor; kalabalık bir başlık yarıda kalmak yerine sonuna kadar doluyor. Tam tablo on dört satır ve X-Posed'un bu eklentiden daha iyi yaptığı üç şeyi açık açık söylüyor.",
    link: 'Tam karşılaştırmayı gör →',
  },

  cta: {
    heading: 'Akışının nereden geldiğini tahmin etmeyi bırak.',
    body: 'Ücretsiz ve kurar kurmaz çalışıyor. Hesap falan açmana gerek yok.',
  },

  faq: {
    heading: 'İnsanların gerçekten sorduğu sorular',
  },

  footer: {
    tagline:
      "Her X profilinde bir ülke bayrağı, X'in kendi verisinden. Tek kişi yaptı, arkasında şirket falan yok.",
    version: 'Sürüm',
    notAffiliated:
      "X Corp. ile bağlantısı yoktur. Konum verisi X'in kendi herkese açık uç noktalarından gelir.",
    groupExtension: 'Eklenti',
    groupGuides: 'Rehberler',
    groupSmallPrint: 'Küçük yazı',
    chromeWebStore: 'Chrome Web Mağazası',
    supportProject: 'Projeye destek ol',
    guideAboutAccount: 'X "Bu hesap hakkında"',
    guideEngagementFarming: 'Etkileşim çiftçiliğini yakalamak',
    guideRateLimit: 'X’in hız sınırı',
    guideComparison: 'X-Posed ile karşılaştırma',
    privacyPolicy: 'Gizlilik politikası',
    whatIsNotCollected: 'Toplanmayanlar',
    contact: 'İletişim',
  },

  table: {
    caption: 'X-Pat, en çok kurulan üç X konum eklentisiyle karşılaştırıldı',
    feature: 'Özellik',
    yes: 'var',
    no: 'yok',
    notStated: 'belirtilmemiş',
    notApplicable: 'geçerli değil',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Menü açmadan satır içinde ülke gösterimi',
        note: 'IP tahmini değil, X\'in kendi "Bu hesap hakkında" verisinden okunuyor.',
      },
      signupSource: {
        label: 'Kayıt kaynağı — Apple, Google Play veya web',
        note: '',
      },
      accountAge: { label: 'Hesap yaşı', note: '' },
      handleChanges: { label: 'Kullanıcı adı değişiklik sayısı', note: '' },
      hideByCountry: {
        label: 'Ülke ve bölgeye göre gizleme veya katlama',
        note: 'Burada varsayılan, "Göster" düğmesinin arkasına katlamaktır, çünkü paylaşımları sessizce düşüren bir akış denetlenebilir değildir.',
      },
      allowlist: {
        label: 'Her zaman göster listesi ve kural başına istisnalar',
        note: '',
      },
      budgetFromHeaders: {
        label:
          'Hızını X’in rate-limit başlıklarındaki gerçek bütçeye göre ayarlar',
        note: 'X-Pat her yanıtta x-rate-limit başlıklarını okur ve sorgularını pencerede kalana yayar, bir kısmını üzerine geldiğin hesaplara saklar. X-Posed sabit 150 ms aralık ve sekiz paralel istekle ilerler; reset başlığını ancak 429 geldikten sonra okur.',
      },
      sharedCache: {
        label: 'Ortak önbellek, bayraklar istek sınırını aşabilsin diye',
        note: 'X bir tarayıcıya 15 dakikada yaklaşık 50 profil sorgusu tanıyor. Ortak önbellek olmazsa bütün deneyim bu tavandan ibaret.',
      },
      cacheServerSource: {
        label: 'Önbellek sunucusunun kaynak kodu yayınlanmış',
        note: 'Katkıları gönderen eklenti değil, katkıları alan sunucu. Bizimki aynı repoda, deploy belgeleriyle — ister oku, ister kendininkini çalıştır.',
      },
      crossChecked: {
        label: 'Önbellek kayıtları kurulumlar arasında çapraz kontrol edilir',
        note: 'Bizimki kurulum başına oy tutar ve uzlaşıyı sunar, yanında senin yükseltebileceğin bir güven eşiği. X-Posed ise bir kullanıcı adı için kabul edilen son değeri sakladığını belgeliyor.',
      },
      extensionSource: {
        label: 'Eklentinin kaynak kodu yayınlanmış',
        note: '',
      },
      testSuite: {
        label: 'Repoda otomatik test takımı',
        note: "Birim, kaydedilmiş trafiğe karşı uçtan uca ve görsel gerileme testleri. Sayı, CI'ın her push'ta koştuğu test adedi.",
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'iPhone / iPad eşlik uygulaması', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed olgun olan',
        body: 'Bizim bir avucumuza karşılık yaklaşık 10.000 Chrome kurulumu, dört aylık başlangıç avantajı ve bizimki binlerdeyken milyonlarca profili tutan bir topluluk önbelleği. Daha büyük önbellek ilk günden daha çok anında bayrak demek. Bu gerçek bir avantaj ve aradaki fark az buz değil.',
      },
      surfaces: {
        title: 'Daha çok yerde var',
        body: "Masaüstü Firefox, Android Firefox'u ve bir iPhone eşlik uygulaması. X-Pat bugün sadece Chromium tarafında — Chrome, Edge, Brave ve Android'de Lemur. Firefox planda, iOS planda değil.",
      },
      languageFilter: {
        title: 'Dil filtresi var',
        body: "Bizde yok, bilerek. X'in gönderi başına dil alanı o kadar sık yanılıyor ki üzerine filtre kurmak gönderilerin görünür bir sebep olmadan kaybolmasına yol açar. Bu eksik özellik değil, savunulabilir bir tercih — ama dil filtrelemeye geldiysen X-Posed'da var, bizde yok.",
      },
    },
    notApplicable: '—',
    testCount: '{count} test',
    none: 'yok',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Rehber',
      titleLead: "X'in",
      titleAccent: '"Bu hesap hakkında"',
      titleRest: ' paneli ve onun için tıklamayı nasıl bırakacağın.',
      lead: 'X hangi hesabın nereden paylaştığını sessizce biliyor ve söylüyor da — profil başına, üç tık derinde, sabrın yettiği kadar. İşte panelin yeri, neyi yanıtlayıp neyi yanıtlayamadığı ve aynı bilgiyi bir yerine seksen yanıt için istediğinde ne yapman gerektiği.',
      whereHeading: 'Panel aslında nerede',
      steps: {
        web: {
          where: 'Web',
          body: 'Profili aç, sonra Takip Et düğmesinin yanındaki ⋯ menüsüne gir. "Bu hesap hakkında" o listede.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Profili aç, başlığın sağ üstündeki ⋯ simgesine dokun. Aynı girdi, aynı panel.',
        },
        what: {
          where: 'Eline geçen',
          body: 'Hesabın bulunduğu ülke, yaklaşık katılım tarihi, kullanıcı adının kaç kez değiştiği ve hangi uygulama mağazasından kaydolduğu.',
        },
      },
      cantHeading: 'Yanıtlayamadıkları',
      cant1:
        'Panel profil başına ve kalıcı pencere şeklinde. Tek bir hesabı didikliyorsan sorun değil; bir yanıt zinciri okurken hiçbir işe yaramaz — ki soru genelde tam o anda doğar. Yüz yanıt, menüden yüz gidiş geliş demek; üçüncüsünde okuduğun zinciri çoktan kaybettin bile.',
      cant2:
        "Üstelik her zaman dolu değil. X azımsanmayacak sayıda hesap için ülke döndürmüyor — genelde eski veya neredeyse hiç aktif olmayanlar. Alan sahiden boşsa açığa çıkarılacak bir şey yoktur, aksini iddia eden her türlü araç IP'den tahmin yürütüyordur.",
      cant3:
        'Güvenilirlik hakkında da hiçbir şey söylemez. X bazı konumları dahili olarak arkasında duramayacağı konum diye işaretler; panel ülkeyi yine de gösterir.',
      sameHeading: 'Aynı alan, menüsüz',
      same1:
        'X-Pat tam olarak panelin okuduğu alanı okuyor — aynı uç nokta, zaten tarayıcında açık olan X oturumunu kullanarak — ve onu kartta bir bayrak olarak, istersen akışta satır içinde çiziyor. IP sorgusu yok, üçüncü taraf veritabanı yok, hesap veya API anahtarı yok.',
      same2:
        "O yanıttan üç şeyi yüzeye çıkarıyor: ülke, hesabın kaydolduğu uygulama mağazası ve X'in konumu doğrulanamaz olarak işaretleyip işaretlemediği — işte panelin atladığı güven sinyali. Katılım tarihi ve kullanıcı adı geçmişi olduğu yerde duruyor; eklenti panelin tamamı olma iddiasında değil.",
      same3:
        'Üstüne aksiyon da alabilirsin: okumak istemediğin ülke ve bölgeler "Göster" düğmesinin arkasına katlanabilir veya gizlenebilir. Varsayılan katlamaktır, çünkü paylaşımları sessizce düşüren bir akış güvenilmezdir.',
    },

    engagementFarming: {
      kicker: 'Rehber',
      titleLead: "X'te",
      titleAccent: 'etkileşim çiftçiliği',
      titleRest: ' nasıl fark edilir.',
      lead: 'X görüntülenme başına ödeme yapmaya başlayalı yanıt yazmak iş oldu. Kazancı dandik bir iş, çıktının da tam bu yüzden böyle görünmesi: hızlı, jenerik ve o an gündemde ne varsa altına yapıştırılmış. Gerçek bir yanıtı çiftlik yanıtından gerçekten ayıran işte bu sinyaller.',
      noVerdictHeading: 'Tek bir sinyal hüküm vermez',
      noVerdict1:
        'Aşağıdaki her işaretin masum bir açıklaması var. Yeni hesap yenidir. Kimi insan gönlü bol takip eder. Aklı başında yazan bir sürü insan biyografisine emoji koyar. Bunlardan birini kanıt sayarsan sıradan yabancıları sil baştan yazarsın; hem tatsız hem bayık.',
      noVerdict2:
        'İşe yarayan üst üste koymaktır. Üç haftalık hesap, binlerce kişiyi takip ediyor, onu onlarca kişi takip ediyor, yanıtlarda birinci sırada, elinde kalıp bir cümle — bu bileşim tesadüf değil, nereye bakacağını bildiğinde iki saniyede okursun.',
      colSignal: 'Sinyal',
      colTell: 'Görünüşü',
      colCost: 'Kontrol maliyeti',
      signals: {
        ratio: {
          signal: 'Takipçi / takip oranı',
          tell: '4.000 hesabı takip ediyor, onu 40 kişi takip ediyor',
          cost: 'Karta bir bakış',
        },
        age: {
          signal: 'Hesap yaşı',
          tell: 'Üç hafta önce katılmış, şimdiden siyasi başlıkların içinde',
          cost: 'Kart',
        },
        latency: {
          signal: 'Yanıt hızı',
          tell: 'Yazarla hiçbir geçmişi olmayan bir hesaptan saniyeler içinde ilk yanıt',
          cost: 'Zaman damgası, bakarsan',
        },
        bio: {
          signal: 'Biyografi yapısı',
          tell: 'Bir cümlelik yer sıra sıra bayrak ve emoji',
          cost: 'Bedava — orada duruyor zaten',
        },
        substance: {
          signal: 'Yanıtın içi',
          tell: 'Bugün dört ayrı gönderinin altında karşına çıkan aynı kalıp cümle',
          cost: 'Çoğunlukla hafıza',
        },
        location: {
          signal: 'Hesap nerede duruyor',
          tell: 'Hiç paylaşmadığı bir ülke hakkında ahkâm kesme',
          cost: 'Profil başına üç tık — ya da satır içinde',
        },
      },
      hiddenHeading: 'Göremediğin',
      hidden1:
        "Yukarıdaki altı sinyalin beşi zaten ekranda. Takipçi sayıları, katılım tarihi, biyografi, yanıtın kendisi — X hepsini sormadan önüne koyuyor. Altıncısı X'in menü arkasında tuttuğu: hesap gerçekte nereden paylaşıyor.",
      hidden2:
        'Bu, belli bir sinir bozuculuk türü için diğerlerinden daha önemli — spam değil tam olarak, hesabın hiçbir bağının olmadığı bir yer hakkında kendinden emin akıl verme. Bunu görebildiğin an aynı metin bambaşka okunuyor ve X öğrenmen için profil başına panel açmanı şart koşuyor.',
      hidden3:
        "<b>X-Pat işte o kısmı yapıyor.</b> Ülkeyi karta, istersen akışta satır içine koyuyor — ayrıca X'in kendisi konumu doğrulayamazsa uyarı ekliyor. Hesaplara puan biçmiyor, yanıtları senin adına yargılamıyor; diğer beş sinyal senin bileceğin iş olarak kalıyor. Gerçekten saklı olan tek bilgiyi üç tıka mahkûm olmaktan kurtarıyor, hepsi bu.",
    },

    comparison: {
      kicker: 'Karşılaştırma',
      titleLead: 'X-Pat karşısında',
      titleAccent: 'X-Posed',
      titleRest: ' ve raftaki diğerleri.',
      lead: "Yaklaşık yirmi eklenti X kullanıcı adının yanına ülke bayrağı koyuyor. Üç tanesinin kayda değer kullanıcısı var. Her biri gerçekte ne yapıyor, X-Pat neyi farklı yapıyor ve X-Posed'un daha iyi yaptığı üç şey — ki çoğu karşılaştırma sayfası bu kısmı es geçer.",
      featureHeading: 'Özellik özellik',
      featureLead:
        'Her hücre, {date} tarihinde okunan herkese açık mağaza sayfası veya herkese açık depodan. Tire işareti sayfanın bunu söylemediği anlamına gelir — kapalı kaynak iki eklenti için bu "yok" demek değildir, öyle çizmek haksızlık olur.',
      aheadHeading: "X-Posed'un önde olduğu noktalar",
      differsHeading: 'Asıl fark ne',
      differs1:
        "Bu kategorideki her şey ortak önbelleğe dayanıyor. X bir tarayıcıya on beş dakikada yaklaşık elli profil sorgusu tanıyor, hareketli bir thread'de bundan fazla hesap var — yani buradaki her eklenti sınırı aşıp çalışmaya devam ediyorsa başkalarının doldurduğu bir önbelleği okuyarak yapıyor. Soru sunucu var mı yok mu değil. Soru o sunucunun ne yapmaya izni olduğu.",
      differs2:
        "<b>Bizimki yayında ve kendininkini çalıştırabilirsin.</b> Önbellek sunucusu eklentiyle aynı repoda, hem Cloudflare Workers hem düz VPS için deploy belgeleriyle. X-Posed eklentisini yayınlıyor — sahiden, MIT lisansıyla — ama katkıların gönderildiği Worker'ı yayınlamıyor. Kurduğun kodu okuyarak denetleyemeyeceğin kısım tam olarak orası.",
      differs3:
        "<b>Burada önbellekten gelen cevap için teyit şart.</b> Katkılar kurulum başına oy olarak saklanıyor ve sunulan uzlaşı oluyor, seçeneklerden yükseltebileceğin bir güven eşiğiyle. X-Posed'un kendi belgeleriyse bir kullanıcı adı için kabul edilen son değeri sakladığını anlatıyor — yani son katkı yapan karar veriyor. İki tasarım da aynı temel sorun hakkında dürüst: hiçbir sunucu bir katkının gerçekten X'ten geldiğini kanıtlayamaz.",
      differs4:
        '<b>Sorgular kimlik taşımaz.</b> Okumalar imzasız bir kullanıcı adı listesidir, sunucunun onları birbirine bağlayacak hiçbir şeyi yoktur, "bu kurulum şu hesaplara baktı" gibi bir bilgi inşa edemez. Okuyucuları saymak tek satır sürer ve bu özelliği anında bitirir, yayınlanan istatistiklerin bilerek düşük olması bu yüzden.',
      differs5:
        'İstek sınırı da yarışılmak yerine karnelenir: arka plan işi pencerenin yüzde sekseninde durur, son on sorgu gerçekten üzerine gittiğin hesaplar için kalır. <a href="{href}">Mekanizma ana sayfada çizili halde</a>.',
      sourcesHeading: 'Kaynaklar',
      sourcesLead:
        '{date} tarihinde okundu. Kurulum sayıları ve özellikler değişir; aşağıda bir şey güncelliğini yitirmişse bu bir duruş değil hatadır, düzeltmenin en hızlı yolu <a href="{href}">sorun takipçisidir</a>.',
      sourceLabel: ' — kaynak: ',
      sourceNotPublished: ' — kaynak yayınlanmamış',
    },
  },

  pages: {
    home: {
      title: 'X-Pat — X Profil Konumu: herhangi bir X profilinin ülkesini gör',
      description:
        "Her X profilinde bir ülke bayrağı, X'in kendi verisinden. VPN uyarıları, paylaşımları ülkeye, kuruma, hesap yaşına veya biyografideki anahtar kelimeye göre gizleme veya vurgulama. Chrome için ücretsiz.",
      faq: [
        {
          q: 'Bir X hesabının hangi ülkeden olduğunu nasıl görürüm?',
          a: 'X her hesap için bir ülke saklıyor ve "Bu hesap hakkında" altında gösteriyor, ama her seferinde tek profil ve sadece menüyü açarsan. Bu eklenti aynı alanı okuyup bayrağı doğrudan karta ve akışa koyuyor, hiçbir şeye tıklamadan görüyorsun.',
        },
        {
          q: 'Bir X hesabının VPN kullandığını anlayabilir miyim?',
          a: "X bazı hesapları konumu doğrulanamaz olarak işaretler. Eklenti bunu bayrağın yanında ⚠ VPN rozeti olarak gösterir. Bu X'in kendisinin ülkeden emin olmadığı anlamına gelir, VPN kanıtlandı demek değildir.",
        },
        {
          q: "Belli ülkelerden gelen tweet'leri gizleyebilir veya katlayabilir miyim?",
          a: 'Evet. Seçeneklerden ülkeleri veya bölgeleri seç, eşleşen tweet\'ler "Göster" düğmesinin arkasına mı katlansın yoksa tamamen mi kaybolsun sen karar ver. Varsayılan katlamak, yani akışından hiçbir şey sessizce eksilmez.',
        },
        {
          q: 'Ülke dışında bir şeye göre filtreleyebilir miyim?',
          a: "Evet. X'in bir kuruma bağlı saydığı bütün hesapları engelleyebilir, seçtiğin eşikten daha yeni hesapları işaretleyebilir, adı veya biyografisi anahtar kelimelerine uyan — ya da biyografisi çoğunlukla bayrak emojisinden oluşan — hesapları vurgulayabilirsin. Yaş ve anahtar kelime kuralları sadece işaretler, asla silmez. İzin listesi ve kural başına istisnalar muaf tutmak istediğin hesapları kapsar.",
        },
        {
          q: 'X şifremi veya API anahtarı ister mi?',
          a: 'İkisini de istemez. Tarayıcında zaten açık olan X oturumunu kullanır, sitenin sana bir profil gösterirken yaptığı isteğin aynısını atar. Giriş yok, API anahtarı yok, bize ait hesap da yok.',
        },
        {
          q: 'Konum doğru mu?',
          a: "X'in kendi verisi kadar doğru, çünkü X'in kendi verisi. Eklenti IP'den tahmin yürütmez, dışarıdan hiçbir veritabanına danışmaz. X bir konumu doğrulanmamış diye işaretlerse eklenti de aynısını yapar.",
        },
      ],
    },

    aboutThisAccount: {
      title:
        'X "Bu hesap hakkında": nasıl görürsün ve nasıl daha hızlı görürsün',
      description:
        'X her hesabın ülkesini "Bu hesap hakkında" altında gösteriyor — profil profili, menü arkasında. Nerede bulunur, satır içinde nasıl alınır.',
      faq: [
        {
          q: 'X\'te "Bu hesap hakkında" nedir?',
          a: "X'in eklediği, hesabın nerede olduğunu, ne zaman katıldığını, kullanıcı adını kaç kez değiştirdiğini ve hangi uygulama mağazasından kaydolduğunu gösteren bir panel. Bu eklentinin okuduğu ülke alanı işte aynı alan.",
        },
        {
          q: '"Bu hesap hakkında" nerede?',
          a: 'Bir profili aç, profil başlığının sağ üstündeki ⋯ menüsüne dokun, "Bu hesap hakkında"yı seç. Web\'de aynı menü, Takip Et düğmesinin yanında.',
        },
        {
          q: 'Neden bazı kullanıcılarda "Bu hesap hakkında"yı göremiyorum?',
          a: 'X her hesap için ülke döndürmez — eski veya az aktif hesapların çoğunda kayıtlı bir şey yoktur. Alan sahiden boşsa hiçbir araç dolduramaz, bu da dahil.',
        },
        {
          q: 'Her profili açmadan ülkeyi nasıl görürüm?',
          a: 'İşte bu eklentinin kapattığı boşluk tam olarak bu. Aynı alanı okuyup karta bir bayrak olarak, istersen akışta satır içinde çiziyor — seksen yanıtlık bir zinciri taramak menüye seksen kere girmek anlamına gelmiyor böylece.',
        },
      ],
    },

    engagementFarming: {
      title: "X'te etkileşim çiftçiliği ve yanıt spam'i nasıl fark edilir",
      description:
        "X'te gerçek yanıtı çiftlik yanıtından ayıran sinyaller: hesap yaşı, takipçi oranı, paylaşım örüntüsü ve hesabın gerçekten nerede durduğu.",
      faq: [
        {
          q: "X'te etkileşim çiftçiliği nedir?",
          a: 'Bir şey söylemek için değil, görüntülenme toplamak için tasarlanmış yanıtlar paylaşmak — jenerik onay, geri dönüştürülmüş öfke veya o an gündemdeki gönderinin altına yapıştırılmış kalıp bir cümle. X görüntülenme başına ödemeye başlayalı beri bunun doğrudan maddi karşılığı var.',
        },
        {
          q: 'Bir X yanıtının bot veya çiftlik malı olduğunu nasıl anlarım?',
          a: 'Tek sinyal yetmez. Anlamlı olanlar üst üste binince çıkar: binlerce hesabı takip eden ama onlarca takipçisi olan, haftalar önce açılmış, saniyeler içinde büyük hesaplara yanıt yetiştiren, biyografisi bayrak ve emoji dolu bir hesap. Biri tek başına normal, üçü bir arada nadiren öyle.',
        },
        {
          q: 'Hangi takipçi/takip oranı çiftlik hesabını işaret eder?',
          a: "Takip ettiğin sayısı seni takip edenden kat kat fazlaysa — 0,1'in belirgin şekilde altında bir oran — klasik örüntü budur, toplu takip fark edilmenin en ucuz yoludur. Bir sürü sıradan yeni hesap da aynı görünür, bunu hüküm olarak değil veri noktası olarak al.",
        },
        {
          q: 'Eklenti etkileşim çiftçiliğini tespit ediyor mu?',
          a: 'Doğrudan değil. Yaptığı şey hesabın ülkesini ve VPN durumunu satır içinde göstermek — ki bu her profili tek tek açmadan hiçbir şekilde göremeyeceğin tek sinyal. Bu sayfadaki diğer sinyaller hâlâ senin takdirine kalmış.',
        },
      ],
    },

    rateLimit: {
      title: 'X’in hız sınırı: 15 dakikada 50 profil sorgusu',
      description:
        'X, bir tarayıcıya 15 dakikada yaklaşık 50 hesap sorgusu veriyor. X-Pat bu pencereyi nasıl paylaştırıyor ve çoğu profil neden hiç harcamıyor.',
      faq: [],
    },

    comparison: {
      title: 'X-Posed alternatifi: X-Pat karşılaştırması, özellik özellik',
      description:
        "X-Pat'in X-Posed ve en çok kurulan diğer iki X konum eklentisiyle dürüst bir karşılaştırması — X-Posed'un daha iyi yaptığı üç şey dahil.",
      faq: [
        {
          q: 'En iyi X-Posed alternatifi hangisi?',
          a: "Neye ihtiyacın olduğuna bağlı. X-Posed en oturmuş seçenek, dil filtresi var, Firefox sürümleri ve iPhone uygulaması var — X-Pat'te bunlar yok. X-Pat ortak önbellekte ayrışıyor: sunucusu yayınlanmış ve kendi kendine host edilebilir, önbellek kayıtları sunulmadan önce kurulumlar arasında çapraz doğrulanıyor ve sorgular, sunucunun neye baktığınla ilgili profil çıkarmasına yarayacak hiçbir kimlik taşımıyor.",
        },
        {
          q: 'X-Pat açık kaynak mı?',
          a: 'Evet, MIT lisanslı; konuştuğu önbellek sunucusu da öyle — ikisi aynı repoda, Cloudflare Workers ve düz VPS için deploy belgeleriyle. X-Posed da eklentisini MIT altında yayınlıyor; yayınlamadığı, topluluk önbellek katkılarını alan Worker.',
        },
        {
          q: 'Bu eklentiler X şifremi ister mi?',
          a: "Burada karşılaştırılanların hiçbiri istemez. Tarayıcında zaten açık olan X oturumunu kullanıp X'in sana profil gösterirken yaptığı isteğin aynısını atarlar. Giriş yok, API anahtarı yok, üçüncü taraf hesabı yok.",
        },
        {
          q: "Bayrak neden bir thread'in ortasında kayboluyor?",
          a: "X bir tarayıcıya on beş dakikada yaklaşık elli hesap sorgusu tanıyor, hareketli bir thread'de bundan fazla hesap var. Tavana çarpan eklentiler bayrakları doldurmayı bırakıverir. Bunu önleyen ortak önbellek — profillerin çoğu sorgu yakmaz çünkü başkası çoktan çözmüştür — ve X-Pat ayrıca pencerenin son yüzde yirmisini senin bizzat üzerine gittiğin hesaplara ayırır.",
        },
      ],
    },
  },
}
