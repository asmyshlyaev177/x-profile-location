import type { Dict } from './en'

/** Indonesian. "Kamu" throughout — "Anda" reads like a bank letter. */
export const id: Dict = {
  nav: {
    sections: 'Bagian',
    screenshots: 'Tangkapan layar',
    howItWorks: 'Cara kerja',
    features: 'Fitur',
    privacy: 'Privasi',
    comparison: 'Perbandingan',
    sourceOnGitHub: 'Kode sumber di GitHub',
    home: 'X-Pat — beranda',
  },

  language: {
    label: 'Bahasa',
    choose: 'Pilih bahasa',
  },

  install: {
    chrome: 'Tambahkan ke Chrome',
    edge: 'Tambahkan ke Edge',
    brave: 'Tambahkan ke Brave',
  },

  hero: {
    titleLead: 'Lihat dari mana',
    titleAccent: 'sebenarnya asal profil X',
    lead: 'X sudah tahu dari negara mana sebuah akun nge-post. Cuma nggak dikasih lihat ke kamu. Ini nempel bendera di kartu hover, plus kamu bisa lipat atau sembunyiin negara yang nggak mau kamu baca.',
    seeItRunning: 'Lihat aksinya',
    railWorksIn: 'Jalan di',
    railAndroid: 'Di Android',
    railAccount: 'Akun / kunci API',
    railAccountValue: 'Nggak perlu',
    railVersion: 'Versi',
    panelFollowing: 'Mengikuti',
    panelFollowers: 'Pengikut',
    panelHidden: '🚫 Disembunyikan · 🇮🇳 India',
    panelShow: 'Tampilkan',
  },

  screenshots: {
    heading: 'Begini tampilannya di dalam X.',
    lead: 'Tangkapan layar dari timeline biasa. Pilih satu buat lihat cara kerjanya.',
    fullSize: 'Ukuran penuh',
    viewer: 'Penampil tangkapan layar',
    close: 'Tutup',
    prev: 'Tangkapan sebelumnya',
    next: 'Tangkapan berikutnya',
    railLabel: 'Tangkapan layar',
    shots: {
      hover: {
        label: 'Bendera pas hover',
        alt: 'Kartu hover X dengan bendera Jerman dan kata Jerman di bawah username',
      },
      vpn: {
        label: 'Peringatan VPN',
        alt: 'Kartu hover yang nampilin bendera AS di samping lencana merah ⚠ VPN',
      },
      feed: {
        label: 'Bendera di timeline',
        alt: 'Sebuah timeline di mana setiap penulis membawa bendera negaranya langsung, tanpa perlu hover',
      },
      blocked: {
        label: 'Disembunyikan di linimasa',
        alt: 'Linimasa dengan satu posting terlipat di balik bilah “🚫 Disembunyikan · Mesir” dan tombol Tampilkan',
      },
      keyword: {
        label: 'Sorotan kata kunci',
        alt: 'Tweet disorot warna amber karena bio penulisnya cocok sama kata kunci tersimpan',
      },
      flagBios: {
        label: 'Bio yang penuh bendera',
        alt: 'Akun yang ditandai karena ngejejalin beberapa bendera negara ke dalam bionya',
      },
      swipe: {
        label: 'Geser di HP',
        alt: 'Timeline selebar HP dengan gerakan geser kanan yang memunculkan negara penulis sebagai overlay',
      },
    },
  },

  howItWorks: {
    heading: 'Dari mana bendera itu sebetulnya berasal',
    lead: 'Setiap akun di X punya data negara yang tersimpan. X nyimpen itu di balik menu yang hampir nggak pernah dibuka orang. Nggak ada yang nebak alamat IP atau tanya database luar di sini.',
    steps: {
      hover: {
        title: 'Kamu hover sebuah profil',
        body: 'Atau geser ke kanan sebuah tweet, kalau kamu di HP. Nggak ada halaman pengaturan yang harus dibuka dulu; pengecekannya kejadian pas di tempat kursor kamu berada.',
        readoutKey: 'Pemicu',
        readoutValue: 'hover · geser · timeline',
      },
      ask: {
        title: 'Browser kamu langsung tanya ke X',
        body: 'Dia pakai ulang sesi yang udah ada di browser kamu buat bikin request yang sama kayak situs itu pas nunjukin akun. Nggak ada punya kita yang nyempil di tengah.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Benderanya mendarat di kartu',
        body: 'Browser kamu nyimpen jawabannya selama 30 hari, jadi lihat kedua gratis. Ada tombol di halaman opsi buat ngebersihin.',
        readoutKey: 'Cache',
        readoutValue: 'lokal · 30 hari',
      },
    },
  },

  rateBudget: {
    link: 'Cara kerja jatah lookup',
    heading: 'Batas laju X — diselesaikan, bukan ditabrak.',
    lead: 'Kamu pasti pernah liat gagalnya. Bagian atas utasan keisi, terus berhenti. Itu batasnya: lima puluh pengecekan akun tiap lima belas menit, padahal satu utasan rame isinya jauh lebih banyak dari itu.',
    body: 'Sebagian besar profil di sini nggak makan jatah. Mereka udah ada di cache, atau ada yang udah ngecek duluan dan cache bareng yang jawab. Sisanya dijatah rapi.',
    closing:
      'Kalaupun jatahnya abis, kamu dapat hitung mundur sampai reset, bukan bendera kosong. Porsi dan ritmenya bisa kamu atur sendiri.',
    facts: {
      real: {
        title: 'Angka benerannya',
        body: 'Jatah itu dari header respons X sendiri, bukan nebak yang ditanam pas build. Hover kamu juga motong jatah itu.',
        readoutKey: 'Sumber',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Disebar, bukan digas',
        body: 'Sekitar sekali ngecek tiap 22 detik, dihitung ulang tiap kali — melar pas kamu banyak hover, ngerapat pas jendela keisi lagi.',
        readoutKey: 'Ritme',
        readoutValue: 'jendela ÷ jatah',
      },
      hovers: {
        title: 'Hover selalu menang',
        body: 'Kerja latar berhenti di 80%, jadi sisa jendela masih ada buat akun yang beneran kamu tuju.',
        readoutKey: 'Dicadangkan',
        readoutValue: '10 dari 50',
      },
    },
    bar: {
      caption: 'Satu jendela 15 menit',
      alt: 'Lima puluh pengecekan per jendela: empat puluh buat prefetch latar, sepuluh dicadangkan buat akun yang kamu hover.',
      backgroundNote: 'latar, ditetesin sepanjang lima belas menit penuh',
      reservedNote:
        'ditahan, biar hover nggak pernah jadi request yang nguras jatah kamu',
    },
  },

  features: {
    heading: 'Satu baris info, dan apa yang bisa kamu lakuin.',
    lead: 'Semuanya jalan di kartu hover, halaman profil, tweet satuan, dan timeline. Nggak ada yang perlu diatur dulu.',
    readings: {
      country: {
        name: 'Negara',
        body: 'Negara tempat akun itu nge-post. Muncul di kartu hover, dan juga di timeline kalau kamu nyalain.',
      },
      region: {
        name: 'Wilayah',
        body: 'Kadang X ngasih wilayah, bukan negara. Kamu dapat kode pendeknya: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X kadang nge-tag suatu lokasi sebagai mungkin nggak akurat. Negaranya tetep muncul; kamu cuma jadi tahu buat kurang percaya aja.',
      },
      registration: {
        name: 'Pendaftaran',
        body: 'Dari toko aplikasi mana akun itu dibuat. Biasanya sinyal yang lebih bisa diandelin dari dua ini.',
      },
      cooldown: {
        name: 'Masa tunggu',
        body: 'X ngebatasin jumlah pengecekan yang kamu dapat dalam 15 menit. Kalo mentok, hitung mundur ngasih tahu kapan batasnya kebuka — bukan ninggalin kamu bengong mikirin kok benderanya nggak muncul-muncul.',
      },
    },
    hide: {
      title: 'Sembunyiin negara yang nggak mau kamu baca.',
      p1: 'Begitu kamu bisa lihat asal sebuah postingan, kamu bisa ngapa-ngapain. Pilih lokasi yang mau kamu lewatin dan tentuin nasib tweet mereka.',
      p2: 'Bawaannya melipat. Tweet-nya menciut jadi bilah tipis <b>🚫 Disembunyikan · 🇮🇳 India</b> dengan tombol Tampilkan, jadi kamu tetep tahu di situ ada sesuatu, dan sekali klik balikin permanen. Filter ini ngikutin negara toko aplikasi kalau ada, dan nggak ngusik tweet yang sengaja kamu buka.',
      p3: 'Negara bukan satu-satunya pegangan kamu. Blokir organisasi dan semua akun yang dikasih label X sebagai bagian dari itu ikut kena, sementara akun yang lebih muda dari ambang yang kamu atur bakal ditandai begitu muncul — ditandai, nggak pernah disembunyiin, karena baru bukan bukti apa-apa.',
      readoutCollapse: 'Lipat',
      readoutCollapseValue: 'Bilah tipis + Tampilkan',
      readoutHide: 'Sembunyikan',
      readoutHideValue: 'Dibuang langsung',
      readoutOff: 'Mati',
      readoutOffValue: 'Cuma bendera',
      previewRemoved: 'tweet dihapus',
    },
    highlight: {
      title: 'Tandai akun yang mau kamu kenalin dari jauh.',
      p1: 'Simpen beberapa kata kunci dan tiap tweet yang penulisnya cocok bakal dapet pinggiran amber, dengan kata yang cocok tercetak di sebelah username. Bio yang dijejalin bendera juga kejaring dengan cara yang sama, di jumlah berapa pun yang menurut kamu udah keterlaluan.',
      p2: 'Aturannya ada di halaman opsi ekstensi, bareng pengecualiannya: daftar izin buat akun yang nggak boleh disentuh aturan apa pun, dan pengecualian per aturan buat akun yang mau kamu bebaskan dari kata kunci tapi bukan dari negara.',
      readoutMatch: 'Cocokkan',
      readoutMatchValue: 'Nama · bio',
      readoutFlags: 'Jumlah bendera',
      readoutFlagsValue: 'Ambang kamu',
      readoutExceptions: 'Pengecualian',
      readoutExceptionsValue: 'Per akun',
      optionsTitle: 'Opsi',
      optionsSaved: 'tersimpan',
      optionsByKeyword: 'Sorot berdasar kata kunci 🔍',
      optionsByFlags: 'Sorot berdasar bendera 🏴',
      optionsPlaceholder: 'Ketik kata kunci…',
    },
    cache: {
      title: 'Cache yang diisi semua orang',
      p1: 'Bendera yang kamu cek dan bendera yang dicek orang lain masuk ke kolam yang sama, jadi sebagian besar profil langsung muncul tanpa makan jatah kamu. Cuma username publik dan benderanya yang pergi ke mana-mana. Akun, cookie, bio, dan riwayat kamu nggak.',
      p2: 'Satu saklar matiin semuanya, dan matiin itu juga nghentiin semua pengecekan latar. Habis itu ekstensi nggak ngomong sama siapa-siapa kecuali X, dan cuma pas kamu minta.',
      contributors: 'kontributor',
      shared: 'dibagi',
      instant: '⚡ langsung',
    },
    swipe: {
      title: 'Dan di HP, tinggal geser',
      p1: 'Geser kanan tweet mana aja buat ngambil lokasi penulisnya. Dia jalan di tengah-tengah gerakan geser, nggak nunggu kamu angkat jari, dan overlay ngasih tahu negaranya.',
      p2: 'Di Android kamu butuh browser yang bisa jalanin ekstensi desktop. <b>{browser}</b> yang dipakai buat nyoba ini.',
    },
  },

  trust: {
    heading: 'Ekstensi yang baca sesi X kamu harusnya ngomong jelas.',
    lead: 'Nah gini. Pengecekan langsung ke x.com, sama kayak request situsnya sendiri, dan nggak pernah lewat server kita. Browser kamu nyimpen hasilnya 30 hari, dan halaman opsi ngebersihin kapan aja kamu mau.',
    body: 'Nggak ada analytics atau telemetry dalam ekstensi. Website ini emang pakai Google Analytics, buat jumlah kunjungan dan tombol install mana yang diklik — itu doang.',
    readPolicy: 'Baca kebijakan privasi selengkapnya',
    neverTitle: 'Nggak pernah dikirim ke mana-mana',
    neverNote: 'Nggak ada pengaturan buat ini. Ekstensi nggak pernah bacanya.',
    never: [
      'Akun X, cookie, atau token sesi kamu',
      'Bio, nama tampilan, atau apa pun yang kamu baca',
      'Riwayat browsing atau aktivitas kamu di X',
      'Apa pun yang mengidentifikasi diri kamu',
    ],
    optTitle: 'Cuma pas cache nyala',
    optNote:
      'Satu saklar di halaman opsi yang ngatur ini. Matiin, nggak ada yang keluar.',
    optional: [
      'Username publik yang kamu cek, misalnya @jack',
      'Data benderanya: lokasi, sumber, indikator VPN',
      'ID install acak, biar bendera yang sama dari orang beda cuma kehitung sekali',
    ],
  },

  compareTeaser: {
    heading: 'Udah pakai yang lain?',
    lead: 'Sekitar dua puluh ekstensi naro bendera di samping username. Perbedaan yang penting bukan di daftar fitur — tapi di apa yang boleh dilakukan cache bareng, dan di apa yang kejadian pas lima puluh pengecekan dari X habis.',
    body: 'Yang ini ngatur tempo sendiri berdasarkan jatah asli dari header respons X, dan nyisain sepuluh pengecekan buat akun yang kamu hover, jadi thread rame tetap kelar keisi, bukan berhenti di tengah. Tabel lengkapnya ada empat belas baris dan nyebutin tiga hal yang X-Posed lakuin lebih baik dari ekstensi ini.',
    link: 'Lihat perbandingan lengkap →',
  },

  cta: {
    heading: 'Udah nggak usah nebak-nebak asal timeline kamu.',
    body: 'Gratis, langsung jalan begitu ke-install. Nggak perlu bikin akun.',
  },

  faq: {
    heading: 'Pertanyaan yang beneran ditanyain orang',
  },

  footer: {
    tagline:
      'Bendera negara di setiap profil X, diambil dari data X sendiri. Dibikin satu orang, nggak ada perusahaan di belakangnya.',
    version: 'Versi',
    notAffiliated:
      'Nggak berafiliasi sama X Corp. Data lokasi dari endpoint publik X sendiri.',
    groupExtension: 'Ekstensi',
    groupGuides: 'Panduan',
    groupSmallPrint: 'Cetakan kecil',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Dukung proyek',
    guideAboutAccount: '"Tentang akun ini" di X',
    guideEngagementFarming: 'Kenali engagement farming',
    guideRateLimit: 'Batas laju X',
    guideComparison: 'Dibandingin sama X-Posed',
    privacyPolicy: 'Kebijakan privasi',
    whatIsNotCollected: 'Yang nggak dikumpulin',
    contact: 'Kontak',
  },

  table: {
    caption:
      'X-Pat dibandingkan dengan tiga ekstensi lokasi X paling banyak di-install',
    feature: 'Fitur',
    yes: 'ya',
    no: 'tidak',
    notStated: 'nggak disebutkan',
    notApplicable: 'nggak berlaku',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Negara ditampilkan inline, tanpa buka menu',
        note: 'Dibaca dari data "Tentang akun ini" milik X sendiri, bukan nebak dari alamat IP.',
      },
      signupSource: {
        label: 'Sumber pendaftaran — Apple, Google Play, atau web',
        note: '',
      },
      accountAge: { label: 'Umur akun', note: '' },
      handleChanges: { label: 'Jumlah ganti username', note: '' },
      hideByCountry: {
        label: 'Sembunyiin atau lipat berdasarkan negara dan wilayah',
        note: 'Melipat di balik tombol "Tampilkan" bawaan di sini, karena timeline yang diam-diam ngebuang postingan itu timeline yang nggak bisa kamu audit.',
      },
      allowlist: {
        label: 'Daftar izin selalu-tampil dan pengecualian per aturan',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Ngatur tempo dari jatah asli di header rate limit X',
        note: 'X-Pat baca header x-rate-limit di tiap respons dan nyebar pengecekannya ke sisa jendela, sambil nyisain sebagian buat akun yang kamu hover. X-Posed jalan di interval tetap 150 ms dengan delapan permintaan paralel, dan baru baca header reset setelah kena 429.',
      },
      sharedCache: {
        label: 'Cache bareng, biar bendera tetep hidup lewat batas laju',
        note: 'X ngizinin satu browser sekitar 50 pengecekan profil per 15 menit. Tanpa cache bareng, mentok di langit-langit itu.',
      },
      cacheServerSource: {
        label: 'Kode sumber server cache dipublikasi',
        note: 'Server yang nerima kontribusi, bukan cuma ekstensi yang ngirim. Punya kita di repo yang sama, ada dokumen deploy — kamu bisa baca, atau jalanin sendiri.',
      },
      crossChecked: {
        label: 'Entri cache dicek silang antar install',
        note: 'Punya kita nyimpen suara per install dan nyajiin konsensus, dengan ambang keyakinan yang bisa kamu naikin. X-Posed mendokumentasiin penyimpanan nilai terakhir yang diterima buat suatu username.',
      },
      extensionSource: {
        label: 'Kode sumber ekstensi dipublikasi',
        note: '',
      },
      testSuite: {
        label: 'Rangkaian tes otomatis di dalam repo',
        note: 'Unit, end-to-end lawan traffic yang direkam, dan regresi visual. Angkanya itu yang dijalanin CI tiap push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'Aplikasi pendamping iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed yang lebih matang',
        body: 'Sekitar 10.000 install Chrome lawan segelintir punya kita, empat bulan lebih duluan, dan cache komunitas jutaan profil sementara punya kita ribuan. Cache yang lebih gede memang artinya lebih banyak bendera instan dari hari pertama. Itu keunggulan nyata dan jaraknya nggak deket.',
      },
      surfaces: {
        title: 'Dia tersedia di lebih banyak platform',
        body: 'Firefox desktop, Firefox Android, dan aplikasi pendamping iPhone. X-Pat sekarang baru Chromium — Chrome, Edge, Brave, dan Kiwi di Android. Firefox direncanain, iOS nggak.',
      },
      languageFilter: {
        title: 'Dia punya filter bahasa',
        body: 'Kita nggak, sengaja. Kolom bahasa per postingan X cukup sering salah sampai nyaring pake itu bikin postingan ilang tanpa alasan yang jelas. Itu pilihan yang bisa dipertahanin, bukan fitur yang ketinggalan — tapi kalau filter bahasa yang kamu cari, X-Posed punya itu dan kita nggak.',
      },
    },
    notApplicable: '—',
    testCount: '{count} tes',
    none: 'nggak ada',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Panduan',
      titleLead: 'Fitur',
      titleAccent: '"Tentang akun ini"',
      titleRest: ' di X, dan cara berhenti ngeklik buat lihatnya.',
      lead: 'X diam-diam tahu dari negara mana tiap akun nge-post, dan dia mau kasih tahu kamu — satu profil satu kali, tiga ketukan dalemnya, sebanyak profil yang kamu sabar. Berikut posisi panelnya, apa yang bisa dan nggak bisa dijawab, dan apa yang harus dilakuin pas kamu mau fakta yang sama buat delapan puluh balasan, bukan cuma satu.',
      whereHeading: 'Di mana panelnya sebenernya',
      steps: {
        web: {
          where: 'Web',
          body: 'Buka profilnya, terus menu ⋯ di sebelah tombol Ikuti. "Tentang akun ini" ada di daftar itu.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Buka profilnya terus ketuk ⋯ di kanan atas header. Entri yang sama, panel yang sama.',
        },
        what: {
          where: 'Yang kamu dapat',
          body: 'Negara tempat akun itu basisnya, kira-kira kapan dia gabung, berapa kali dia ganti username, dan dari toko aplikasi mana dia daftar.',
        },
      },
      cantHeading: 'Yang nggak bisa dijawab',
      cant1:
        'Panelnya per profil dan modal. Itu nggak masalah pas kamu meriksa satu akun, dan nggak guna pas kamu baca utasan balasan — yang justru momen di mana pertanyaan itu biasanya muncul. Seratus balasan artinya seratus kali bolak-balik menu, dan pas yang ketiga kamu udah kehilangan utasan yang lagi kamu baca.',
      cant2:
        'Dia juga nggak selalu keisi. X nggak ngebalikin negara buat lumayan banyak akun — seringnya yang lebih tua atau nyaris nggak aktif. Pas kolomnya beneran kosong, nggak ada yang bisa diungkap, dan alat apa pun yang ngaku sebaliknya itu lagi nebak alamat IP.',
      cant3:
        'Dan dia nggak ngomong apa-apa soal tingkat keyakinan. Secara internal X nge-tag beberapa lokasi sebagai yang nggak bisa dia jamin; panelnya tetep nampilin negaranya juga.',
      sameHeading: 'Kolom yang sama, tanpa menu',
      same1:
        'X-Pat baca persis kolom yang dibaca panel itu — endpoint yang sama, pakai sesi X yang udah ada di browser kamu — dan nampilin itu sebagai bendera di kartu hover, dan opsional inline di timeline. Nggak ada IP lookup, nggak ada database pihak ketiga, nggak ada akun atau kunci API.',
      same2:
        'Dia munculin tiga hal dari respons itu: negaranya, toko aplikasi tempat akun itu daftar, dan apakah X nge-tag lokasinya sebagai yang nggak bisa dia verifikasi — sinyal keyakinan yang panel tinggalin. Tanggal gabung dan riwayat username tetep di tempatnya; ekstensi ini nggak berusaha jadi keseluruhan panel.',
      same3:
        'Kamu juga bisa bertindak atas itu: negara dan wilayah yang nggak mau kamu baca bisa dilipet di belakang tombol "Tampilkan", atau disembunyiin. Bawaannya lipat, karena timeline yang diam-diam ngebuang postingan itu timeline yang nggak bisa kamu percaya.',
    },

    engagementFarming: {
      kicker: 'Panduan',
      titleLead: 'Cara ngenalin',
      titleAccent: 'engagement farming',
      titleRest: ' di X.',
      lead: 'Sejak X mulai bayar berdasarkan impresi, nge-reply jadi kerjaan. Bukan kerjaan yang bayarannya bagus, dan justru itu kenapa hasilnya kelihatan kayak gitu: cepet, generik, dan ditempel di bawah apa pun yang lagi tren. Ini sinyal yang beneran misahin balasan asli dari balasan hasil ternakan.',
      noVerdictHeading: 'Nggak ada satu sinyal pun yang vonis',
      noVerdict1:
        'Setiap petunjuk di bawah punya penjelasan nggak bersalah. Akun baru ya emang baru. Ada orang yang murah hati nge-follow. Banyak penulis mikir yang punya emoji di bio. Nganggep salah satunya sebagai bukti bakal bikin kamu nge-judge orang biasa, yang selain nggak enak juga ngebosenin.',
      noVerdict2:
        'Yang manjur itu numpukinnya. Akun umur tiga minggu, ngikutin ribuan, diikutin puluhan, pertama di balasan dengan frasa pasaran — kombinasi itu bukan kebetulan, dan kamu bisa bacanya dalam dua detik begitu tahu harus ngelihat ke mana.',
      colSignal: 'Sinyal',
      colTell: 'Keliatannya kayak apa',
      colCost: 'Ongkos ngecek',
      signals: {
        ratio: {
          signal: 'Rasio pengikut / yang diikuti',
          tell: 'Ngikutin 4.000, diikutin 40',
          cost: 'Lirik sekilas ke kartu hover',
        },
        age: {
          signal: 'Umur akun',
          tell: 'Gabung tiga minggu lalu, udah nyelam dalem di utasan politik',
          cost: 'Kartu hover',
        },
        latency: {
          signal: 'Kecepatan balas',
          tell: 'Balasan pertama dalam hitungan detik, dari akun yang nggak punya riwayat apa pun sama penulisnya',
          cost: 'Cap waktu, kalau kamu mau repot ngelihat',
        },
        bio: {
          signal: 'Isi bio',
          tell: 'Sederet bendera dan emoji di tempat yang harusnya kalimat',
          cost: 'Gratis — udah nongol langsung',
        },
        substance: {
          signal: 'Isi balasan',
          tell: 'Frasa pasaran yang sama yang udah kamu lihat di bawah empat postingan lain hari ini',
          cost: 'Sebagian besar cuma ingatan',
        },
        location: {
          signal: 'Di mana akun itu basisnya',
          tell: 'Pede ngegurui soal negara yang belum pernah jadi tempatnya nge-post',
          cost: 'Tiga ketukan, per profil — atau inline',
        },
      },
      hiddenHeading: 'Yang ini nggak bisa kamu lihat',
      hidden1:
        'Lima dari enam sinyal di atas udah ada di layar. Jumlah pengikut, tanggal gabung, bio, balasannya sendiri — X ngasih semua itu tanpa diminta. Yang keenam yang disimpen X di belakang menu: dari mana akun itu sebetulnya nge-post.',
      hidden2:
        'Itu lebih penting dari yang lain buat satu jenis gangguan tertentu — bukan spam persis, tapi instruksi penuh percaya diri tentang tempat yang nggak ada urusannya sama akun itu. Bacanya jadi beda banget begitu kamu bisa lihat, dan X maksa kamu buka panel per profil buat tahu.',
      hidden3:
        '<b>Itu yang dikerjain X-Pat.</b> Dia naro negaranya di kartu hover dan, kalau kamu mau, inline di timeline — plus peringatan pas X sendiri nggak bisa verifikasi lokasinya. Dia nggak nge-skor akun atau ngehakimi balasan buat kamu; lima sinyal lainnya tetep keputusan kamu. Dia cuma bikin satu-satunya fakta yang beneran tersembunyi berhenti ngabisin tiga ketukan.',
    },

    comparison: {
      kicker: 'Perbandingan',
      titleLead: 'X-Pat vs',
      titleAccent: 'X-Posed',
      titleRest: ', dan sisa raknya.',
      lead: 'Sekitar dua puluh ekstensi naro bendera negara di samping username X. Tiga di antaranya punya jumlah pengguna yang berarti. Ini apa yang sebenernya dilakuin tiap ekstensi, apa yang dilakuin X-Pat secara berbeda, dan tiga hal yang X-Posed lakuin lebih baik — bagian yang justru ditinggalin kebanyakan halaman perbandingan.',
      featureHeading: 'Fitur per fitur',
      featureLead:
        'Setiap sel dari listing toko publik atau repositori publik, dibaca pada {date}. Tanda hubung artinya listing-nya nggak nyebut — buat dua ekstensi yang sumbernya tertutup, itu nggak sama dengan "tidak", dan nggambarinnya begitu nggak adil.',
      aheadHeading: 'Di mana X-Posed unggul',
      differsHeading: 'Apa yang sebenernya beda',
      differs1:
        'Semua di kategori ini bergantung sama cache bareng. X ngizinin satu browser sekitar lima puluh pengecekan profil tiap lima belas menit, dan utasan rame isinya jauh lebih banyak dari itu — jadi tiap ekstensi di sini yang tetep jalan lewat batas itu ngelakuinnya dengan baca cache yang diisi orang lain. Pertanyaannya bukan apa ada server. Tapi apa yang boleh dilakuin server itu.',
      differs2:
        '<b>Punya kita dipublikasi, dan kamu bisa jalanin sendiri.</b> Server cache-nya ada di repositori yang sama dengan ekstensinya, ada dokumen deploy buat Cloudflare Workers maupun VPS biasa. X-Posed mempublikasi ekstensinya — beneran, dan di bawah MIT — tapi bukan Worker tempat kontribusinya dikirim. Itu potongan yang nggak bisa kamu cek dengan baca kode yang kamu install.',
      differs3:
        '<b>Jawaban dari cache di sini butuh pengesahan silang.</b> Kontribusi disimpen sebagai suara per install dan konsensusnya yang disajiin, dengan ambang keyakinan yang bisa kamu naikin di halaman opsi. Dokumentasi X-Posed sendiri ngejelasin penyimpanan nilai terakhir yang diterima buat suatu username, yang artinya kontributor terbaru yang nentuin. Kedua desain jujur tentang masalah mendasar yang sama: nggak ada server yang bisa buktiin kontribusi beneran datang dari X.',
      differs4:
        '<b>Pengecekan nggak bawa pengenal sama sekali.</b> Pembacaan berupa daftar username tanpa tanda tangan, jadi server nggak punya apa-apa buat ngegabunginnya dan nggak bisa ngebangun "install ini ngelihat akun-akun ini". Menghitung pembaca cuma satu baris kode dan bakal ngakhirin sifat itu, makanya statistik yang dipublikasi sengaja lebih rendah.',
      differs5:
        'Dan batas lajunya dijatah, bukan diserobot: kerja latar berhenti di delapan puluh persen jendela, jadi sepuluh pengecekan terakhir masih ada buat akun yang beneran kamu hover. <a href="{href}">Mekanismenya digambarin di beranda</a>.',
      sourcesHeading: 'Sumber',
      sourcesLead:
        'Dibaca pada {date}. Jumlah install dan fitur berubah; kalau ada yang kedaluwarsa di bawah, itu kekeliruan bukan sikap, dan <a href="{href}">pelacak isu</a> cara paling cepet buat ngebenerinnya.',
      sourceLabel: ' — sumber: ',
      sourceNotPublished: ' — sumber nggak dipublikasi',
    },
  },

  pages: {
    home: {
      title: 'X-Pat — Lokasi Profil X: lihat negara profil X mana pun',
      description:
        'Bendera negara di setiap profil X, dari data X sendiri. Peringatan VPN, dan sembunyiin atau sorot postingan berdasar negara, organisasi, umur, atau kata kunci bio. Gratis buat Chrome.',
      faq: [
        {
          q: 'Gimana cara lihat akun X dari negara mana?',
          a: 'X nyimpen data negara buat tiap akun dan nunjukinnya di bawah "Tentang akun ini", tapi satu profil satu kali dan cuma kalau kamu buka menunya. Ekstensi ini baca kolom yang sama dan naro benderanya langsung di kartu hover dan timeline, jadi kamu lihat tanpa ngeklik apa-apa.',
        },
        {
          q: 'Bisa tahu kalau akun X pakai VPN?',
          a: 'X nge-tag beberapa akun punya lokasi yang nggak bisa dia verifikasi. Ekstensi ini munculin sebagai lencana ⚠ VPN di sebelah bendera. Artinya X sendiri yang ragu soal negaranya, bukan berarti VPN-nya terbukti.',
        },
        {
          q: 'Bisa sembunyiin atau lipet tweet dari negara tertentu?',
          a: 'Bisa. Pilih negara atau wilayahnya di halaman opsi terus tentuin tweet yang cocok mau dilipet di balik tombol "Tampilkan" atau ilang total. Bawaannya lipet, jadi nggak pernah ada yang diam-diam hilang dari timeline kamu.',
        },
        {
          q: 'Bisa nyaring selain negara?',
          a: 'Bisa. Kamu bisa ngeblokir tiap akun yang dikasih label X sebagai bagian dari organisasi, nandain akun yang lebih muda dari ambang yang kamu pilih, dan nyorot akun yang nama atau bionya cocok sama kata kunci — atau bionya isinya mayoritas emoji bendera. Aturan umur dan kata kunci cuma nandain postingan; nggak pernah ngebuang. Daftar izin dan pengecualian per aturan ngelindungin akun yang mau kamu spare.',
        },
        {
          q: 'Perlu password X-ku atau kunci API?',
          a: 'Nggak perlu. Dia pakai ulang sesi X yang udah ada di browser kamu buat bikin request yang sama kayak pas situs itu nunjukin profil. Nggak ada login, nggak ada kunci API, dan nggak ada akun kita.',
        },
        {
          q: 'Lokasinya akurat?',
          a: 'Sepersis akuratnya data X sendiri, soalnya ya memang data X. Ekstensi ini nggak nebak dari alamat IP atau nanya database luar mana pun. Di mana X nge-tag lokasi sebagai belum terverifikasi, ekstensinya juga gitu.',
        },
      ],
    },

    aboutThisAccount: {
      title: '"Tentang akun ini" di X: cara liatnya, dan liatnya lebih cepet',
      description:
        'X nunjukin negara tiap akun di bawah "Tentang akun ini" — satu profil satu kali, di balik menu. Ini letaknya, dan cara dapetinnya secara inline.',
      faq: [
        {
          q: 'Apa itu "Tentang akun ini" di X?',
          a: 'Panel yang ditambahin X, nunjukin di mana akun itu basisnya, kira-kira kapan gabung, berapa kali ganti username, dan dari toko aplikasi mana dia daftar. Itu kolom negara yang sama yang dibaca ekstensi ini.',
        },
        {
          q: '"Tentang akun ini" di mana?',
          a: 'Buka profil, ketuk menu ⋯ di kanan atas header profil, terus pilih "Tentang akun ini". Di web, dia ada di menu tambahan yang sama di sebelah tombol Ikuti.',
        },
        {
          q: 'Kenapa "Tentang akun ini" nggak muncul buat sebagian pengguna?',
          a: 'X nggak ngebalikin negara buat tiap akun — akun yang lebih tua atau kurang aktif seringnya nggak ada datanya. Pas kolomnya beneran kosong, nggak ada alat yang bisa ngisi, termasuk yang ini.',
        },
        {
          q: 'Gimana cara lihat negaranya tanpa buka tiap profil?',
          a: 'Itu celah yang ditutup ekstensi ini. Dia baca kolom yang sama dan nampilinnya sebagai bendera di kartu hover dan, kalau kamu mau, inline di timeline — jadi mindai utasan delapan puluh balasan nggak berarti delapan puluh kali kunjungan menu.',
        },
      ],
    },

    engagementFarming: {
      title: 'Cara ngenalin engagement farming dan spam balasan di X',
      description:
        'Sinyal yang misahin balasan asli dari balasan ternakan di X: umur akun, rasio pengikut, pola nge-post, dan di mana akun itu sebenernya basisnya.',
      faq: [
        {
          q: 'Apa itu engagement farming di X?',
          a: 'Nge-post balasan yang dirancang buat manen impresi, bukan ngomong sesuatu — setuju generik, kemarahan daur ulang, atau frasa pasaran yang ditempel di bawah postingan mana pun yang lagi tren. Sejak X mulai bayar berdasarkan impresi, ada motif duit langsung buat itu.',
        },
        {
          q: 'Gimana cara tahu balasan X dari bot atau farm?',
          a: 'Nggak ada satu sinyal pun yang pasti. Yang berguna itu yang numpuk: akun ngikutin ribuan sementara diikutin puluhan, dibuat beberapa minggu lalu, ngebalas dalam hitungan detik ke akun gede, dengan bio penuh bendera dan emoji. Satu doang mah biasa; tiga sekaligus jarang biasa.',
        },
        {
          q: 'Rasio pengikut-ngikutin yang gimana yang mencurigakan?',
          a: 'Ngikutin jauh lebih banyak akun daripada yang ngikutin balik — rasio jauh di bawah 0,1 — pola klasiknya, karena ngikutin massal itu cara paling murah buat diperhatiin. Banyak akun baru biasa juga keliatannya gitu, jadi anggap aja satu masukan, bukan vonis.',
        },
        {
          q: 'Ekstensi ini ngedeteksi engagement farming?',
          a: 'Nggak langsung. Yang dia lakuin itu munculin negara dan status VPN akun secara inline, yaitu satu-satunya sinyal yang nggak bisa kamu lihat tanpa buka tiap profil. Sinyal-sinyal lain di halaman ini tetep penilaian kamu sendiri.',
        },
      ],
    },

    rateLimit: {
      title: 'Batas laju X: 50 pencarian profil setiap 15 menit',
      description:
        'X mengizinkan satu peramban sekitar 50 pencarian akun tiap 15 menit. Bagaimana X-Pat menjatah jendela itu, dan mengapa sebagian besar profil tidak memakainya.',
      faq: [],
    },

    comparison: {
      title: 'Alternatif X-Posed: X-Pat dibandingin, fitur per fitur',
      description:
        'Perbandingan jujur X-Pat lawan X-Posed dan dua ekstensi lokasi X paling banyak di-install lainnya — termasuk tiga hal yang X-Posed lakuin lebih baik.',
      faq: [
        {
          q: 'Alternatif X-Posed yang paling bagus apa?',
          a: 'Tergantung kamu butuh apa. X-Posed pilihan paling mapan dan punya filter bahasa, versi Firefox, dan aplikasi iPhone yang nggak dimiliki X-Pat. X-Pat beda di cache barengnya: servernya dipublikasi dan bisa di-self-host, entri cache dicek silang antar install sebelum disajiin, dan pengecekan nggak bawa pengenal yang bisa dipakai server buat ngebangun profil tentang apa yang kamu lihat.',
        },
        {
          q: 'X-Pat open source?',
          a: 'Ya, lisensi MIT, dan begitu juga server cache yang dia ajak ngomong — dua-duanya di repositori yang sama, ada dokumen deploy buat Cloudflare Workers dan buat VPS biasa. X-Posed juga mempublikasi ekstensinya di bawah MIT; yang nggak dipublikasi adalah Worker yang nerima kontribusi cache komunitas.',
        },
        {
          q: 'Ekstensi-ekstensi ini perlu password X-ku?',
          a: 'Nggak satu pun yang dibandingin di sini butuh. Mereka pakai ulang sesi X yang lagi kebuka di browser kamu buat bikin request yang sama kayak yang X lakuin pas nunjukin profil. Nggak ada login, nggak ada kunci API, dan nggak ada akun pihak ketiga.',
        },
        {
          q: 'Kok benderanya berhenti muncul di tengah utasan?',
          a: 'X ngizinin satu browser sekitar lima puluh pengecekan akun tiap lima belas menit, dan utasan rame isinya jauh lebih banyak dari itu. Ekstensi yang nabrak langit-langit ya berhenti ngisi bendera. Cache bareng yang ngehindarin — sebagian besar profil nggak makan jatah karena ada yang udah ngeresolve duluan — dan X-Pat nambah nyadangin dua puluh persen terakhir jendela buat akun yang kamu hover sendiri.',
        },
      ],
    },
  },
}
