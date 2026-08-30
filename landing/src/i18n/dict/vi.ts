import type { Dict } from './en'

/** Vietnamese. "Bạn" throughout — the neutral second person a product can use. */
export const vi: Dict = {
  nav: {
    sections: 'Mục lục',
    screenshots: 'Ảnh chụp màn hình',
    howItWorks: 'Cách hoạt động',
    features: 'Tính năng',
    privacy: 'Quyền riêng tư',
    comparison: 'So sánh',
    sourceOnGitHub: 'Mã nguồn trên GitHub',
    home: 'X-Pat — trang chủ',
  },

  language: {
    label: 'Ngôn ngữ',
    choose: 'Chọn ngôn ngữ',
  },

  install: {
    chrome: 'Thêm vào Chrome',
    edge: 'Thêm vào Edge',
    brave: 'Thêm vào Brave',
  },

  hero: {
    titleLead: 'Xem một hồ sơ X',
    titleAccent: 'thực sự đến từ đâu',
    lead: 'X vốn biết mỗi tài khoản đăng bài từ nước nào. Chỉ là nó không cho bạn thấy. Cái này nhét lá cờ vào thẻ hover, đồng thời cho bạn thu gọn hoặc ẩn mấy nước bạn không muốn đọc.',
    seeItRunning: 'Xem thử',
    railWorksIn: 'Dùng được trên',
    railAndroid: 'Trên Android',
    railAccount: 'Tài khoản / khóa API',
    railAccountValue: 'Không cần',
    railVersion: 'Phiên bản',
    panelFollowing: 'Đang theo dõi',
    panelFollowers: 'Người theo dõi',
    panelHidden: '🚫 Đã ẩn · 🇮🇳 Ấn Độ',
    panelShow: 'Hiện',
  },

  screenshots: {
    heading: 'Đây, nó đang chạy trong X luôn này.',
    lead: 'Ảnh chụp từ một timeline bình thường. Chọn một tấm để xem nó hoạt động ra sao.',
    fullSize: 'Kích thước đầy đủ',
    viewer: 'Trình xem ảnh',
    close: 'Đóng',
    prev: 'Ảnh trước',
    next: 'Ảnh sau',
    railLabel: 'Ảnh chụp màn hình',
    shots: {
      hover: {
        label: 'Cờ khi rê chuột',
        alt: 'Một thẻ hover của X có cờ Đức và chữ Đức nằm dưới tên người dùng',
      },
      vpn: {
        label: 'Cảnh báo VPN',
        alt: 'Một thẻ hover hiển thị cờ Mỹ kèm huy hiệu ⚠ VPN đỏ bên cạnh',
      },
      feed: {
        label: 'Cờ trong timeline',
        alt: 'Một timeline mà mỗi người đăng đều kèm cờ nước của họ trên dòng, khỏi cần rê chuột',
      },
      blocked: {
        label: 'Ẩn trong dòng thời gian',
        alt: 'Một dòng thời gian có bài đăng được gấp lại sau thanh “🚫 Đã ẩn · Ai Cập” và nút Hiện',
      },
      keyword: {
        label: 'Đánh dấu theo từ khóa',
        alt: 'Một tweet được tô viền hổ phách vì tiểu sử tác giả khớp với từ khóa đã lưu',
      },
      flagBios: {
        label: 'Tiểu sử nhồi cờ',
        alt: 'Một tài khoản bị gắn cờ vì nhét mấy lá cờ nước vào tiểu sử',
      },
      swipe: {
        label: 'Vuốt trên điện thoại',
        alt: 'Timeline rộng bằng màn hình điện thoại, vuốt phải sẽ hiện nước của tác giả dưới dạng lớp phủ',
      },
    },
  },

  howItWorks: {
    heading: 'Lá cờ đến từ đâu thực sự',
    lead: 'Mỗi tài khoản X đều có một nước đăng ký. X giấu nó sau cái menu chẳng mấy ai thèm mở. Ở đây không đoán mò IP hay hỏi cơ sở dữ liệu bên ngoài gì hết.',
    steps: {
      hover: {
        title: 'Bạn rê chuột vào một hồ sơ',
        body: 'Hoặc vuốt phải một tweet, nếu bạn dùng điện thoại. Không có trang cài đặt nào cần mở trước hết; việc tra cứu diễn ra ngay chỗ con trỏ bạn đang để.',
        readoutKey: 'Kích hoạt',
        readoutValue: 'rê chuột · vuốt · timeline',
      },
      ask: {
        title: 'Trình duyệt hỏi thẳng X',
        body: 'Nó dùng lại phiên có sẵn trong trình duyệt để gửi đúng cái request mà chính trang web dùng khi hiện tài khoản cho bạn. Không có gì của chúng tôi chắn ở giữa.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'Cờ hiện trong thẻ',
        body: 'Trình duyệt giữ kết quả 30 ngày, lượt xem sau là free. Có một nút trong trang tùy chọn để xóa đi.',
        readoutKey: 'Cache',
        readoutValue: 'cục bộ · 30 ngày',
      },
    },
  },

  rateBudget: {
    link: 'Cách hạn mức hoạt động',
    heading: 'Rate limit của X — xử lý chứ không đâm đầu vào.',
    lead: 'Bạn từng thấy cảnh này rồi. Đầu thread hiện ra hết, xong phần dưới thì trắng. Đó chính là cái giới hạn: năm chục lần tra mỗi mười lăm phút, mà một thread sôi nổi thì nhiều tài khoản hơn hẳn.',
    body: 'Đa số hồ sơ ở đây chẳng tốn lượt nào. Chúng đã có trong cache, hoặc có người khác tra rồi, cache chung trả lời. Phần còn thì được chia khẩu phần hẳn hoi.',
    closing:
      'Cùng lắm dùng hết thì bạn có đồng hồ đếm ngược tới lúc reset, chứ không phải cờ trống trơn. Cả tỉ lệ lẫn tốc độ đều cho bạn tùy chỉnh.',
    facts: {
      real: {
        title: 'Con số thật',
        body: 'Hạn mức lấy từ header phản hồi của chính X, không phải con số ước lượng nhét cứng lúc build. Bạn rê chuột cũng bị tính vào đó.',
        readoutKey: 'Nguồn',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Trải đều, không chạy hộc tốc',
        body: 'Tầm một lần tra mỗi 22 giây, tính lại liên tục — giãn khi bạn rê chuột nhiều, siết khi cửa sổ đầy lại.',
        readoutKey: 'Tốc độ',
        readoutValue: 'cửa sổ ÷ hạn mức',
      },
      hovers: {
        title: 'Rê chuột luôn thắng',
        body: 'Tác vụ nền dừng ở 80%, để chừa lại cho mấy tài khoản bạn thực sự chỉ vào.',
        readoutKey: 'Dự phòng',
        readoutValue: '10 trong 50',
      },
    },
    bar: {
      caption: 'Một cửa sổ 15 phút',
      alt: 'Năm chục lần tra mỗi cửa sổ: bốn mươi cho prefetch nền, mười giữ lại cho tài khoản bạn rê chuột.',
      backgroundNote: 'nền, nhỏ giọt suốt mười lăm phút',
      reservedNote:
        'giữ lại, để cú rê chuột không bao giờ là cái request làm bạn hết sạch',
    },
  },

  features: {
    heading: 'Một dòng thông tin, và bạn làm được gì với nó.',
    lead: 'Mọi thứ chạy trên thẻ hover, trang hồ sơ, từng tweet lẻ, và cả timeline. Không tốn câu nào để cài đặt.',
    readings: {
      country: {
        name: 'Quốc gia',
        body: 'Nước mà tài khoản đăng bài. Hiện trong thẻ hover, và trong timeline nếu bạn bật.',
      },
      region: {
        name: 'Khu vực',
        body: 'Có khi X trả về vùng thay vì nước. Bạn sẽ thấy mã viết tắt: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X đôi khi gắn cờ một vị trí là có thể không chính xác. Nước vẫn hiện; chỉ là bạn biết nên tin ít đi.',
      },
      registration: {
        name: 'Đăng ký',
        body: 'Tài khoản được tạo qua kho ứng dụng nào. Thường là tín hiệu đáng tin hơn trong hai cái.',
      },
      cooldown: {
        name: 'Thời gian chờ',
        body: 'X giới hạn số lần tra trong 15 phút. Đụng trần thì có đồng hồ đếm lúc nào reset, thay vì để bạn băn khoăn sao cờ mãi chẳng thấy đâu.',
      },
    },
    hide: {
      title: 'Ẩn nước bạn không muốn đọc.',
      p1: 'Khi đã biết bài đăng đến từ đâu, bạn làm được gì đó với nó. Chọn nơi bạn muốn bỏ qua rồi quyết định tweet của họ sẽ ra sao.',
      p2: 'Mặc định là thu gọn. Tweet co lại thành một thanh mỏng <b>🚫 Đã ẩn · 🇮🇳 Ấn Độ</b> kèm nút Hiện, để bạn vẫn biết chỗ đó từng có gì, và bấm một cái là nó trở lại. Bộ lọc theo sát nước trong kho ứng dụng nếu có, còn tweet bạn cố tình mở thì nó để yên.',
      p3: 'Không chỉ có nước là tay nắm. Chặn một tổ chức là mọi tài khoản được X gắn nhãn thuộc tổ chức đó cũng bay theo, còn tài khoản non hơn mốc bạn chọn thì bị đánh dấu lúc xuất hiện — đánh dấu thôi, không ẩn, vì mới tạo tài khoản chẳng phải bằng chứng cho điều gì.',
      readoutCollapse: 'Thu gọn',
      readoutCollapseValue: 'Thanh mỏng + Hiện',
      readoutHide: 'Ẩn',
      readoutHideValue: 'Biến mất hẳn',
      readoutOff: 'Tắt',
      readoutOffValue: 'Chỉ cờ',
      previewRemoved: 'đã gỡ tweet',
    },
    highlight: {
      title: 'Đánh dấu tài khoản bạn muốn nhận ra từ xa.',
      p1: 'Lưu vài từ khóa, mọi tweet của tác giả khớp sẽ có viền hổ phách, kèm từ đã khớp in ngay cạnh tên. Tiểu sử nhồi cờ cũng bị bắt kiểu đó ở ngưỡng bạn cho là quá lố.',
      p2: 'Luật nằm trong trang tùy chọn, kèm ngoại lệ: một danh sách cho phép cho tài khoản không luật nào được đụng vào, và ngoại lệ theo từng luật cho tài khoản bạn muốn tha từ khóa nhưng không tha nước.',
      readoutMatch: 'Đối chiếu',
      readoutMatchValue: 'Tên · tiểu sử',
      readoutFlags: 'Số cờ',
      readoutFlagsValue: 'Ngưỡng bạn đặt',
      readoutExceptions: 'Ngoại lệ',
      readoutExceptionsValue: 'Theo tài khoản',
      optionsTitle: 'Tùy chọn',
      optionsSaved: 'đã lưu',
      optionsByKeyword: 'Đánh dấu theo từ khóa 🔍',
      optionsByFlags: 'Đánh dấu theo số cờ 🏴',
      optionsPlaceholder: 'Nhập từ khóa…',
    },
    cache: {
      title: 'Cache ai cũng góp vào',
      p1: 'Cờ bạn tra và cờ người khác tra đổ chung một chỗ, nên đa số hồ sơ ra luôn chứ không ngốn lượt của bạn. Chỉ mỗi tên người dùng và lá cờ là ra ngoài. Tài khoản, cookie, tiểu sử và lịch sử của bạn thì không.',
      p2: 'Một cú bật tắt là tắt, và tắt nó thì tra nền cũng tắt theo. Sau đó extension không nói chuyện với ai ngoài X, và chỉ khi nào bạn hỏi.',
      contributors: 'người góp',
      shared: 'đã chia sẻ',
      instant: '⚡ tức thì',
    },
    swipe: {
      title: 'Còn trên điện thoại, chỉ cần vuốt',
      p1: 'Vuốt phải tweet nào cũng được để lấy vị trí tác giả. Nó chạy ngay giữa động tác vuốt chứ không đợi bạn nhấc tay, và một lớp phủ cho bạn biết nước.',
      p2: 'Trên Android bạn cần trình duyệt chạy được extension desktop. <b>{browser}</b> là cái được dùng để thử.',
    },
  },

  trust: {
    heading: 'Extension đọc phiên X của bạn thì nên nói rõ ràng.',
    lead: 'Đây. Tra cứu đi thẳng tới x.com, giống hệt request của chính trang web, và không đời nào qua server của chúng tôi. Trình duyệt bạn giữ kết quả 30 ngày, và trang tùy chọn xóa sạch lúc nào bạn muốn.',
    body: 'Trong extension không có analytics hay telemetry gì hết. Riêng website này có dùng Google Analytics, để biết lượt truy cập và nút cài nào được bấm — chỉ thế.',
    readPolicy: 'Đọc chính sách bảo mật đầy đủ',
    neverTitle: 'Không bao giờ gửi đi đâu',
    neverNote: 'Không có cài đặt cho mấy thứ này. Extension không đọc chúng.',
    never: [
      'Tài khoản X, cookie hay token phiên của bạn',
      'Tiểu sử, tên hiển thị, hay bất cứ gì bạn đọc',
      'Lịch sử duyệt hay hoạt động của bạn trên X',
      'Bất cứ gì nhận dạng được bạn',
    ],
    optTitle: 'Chỉ khi bật cache',
    optNote:
      'Một công tắc trong trang tùy chọn kiểm soát cái này. Tắt đi là không có gì ra ngoài.',
    optional: [
      'Tên người dùng công khai bạn đã tra, ví dụ @jack',
      'Dữ liệu cờ: vị trí, nguồn, chỉ báo VPN',
      'Một ID cài đặt ngẫu nhiên, để cùng một lá cờ từ nhiều người chỉ tính một lần',
    ],
  },

  compareTeaser: {
    heading: 'Đang xài một cái khác rồi à?',
    lead: 'Khoảng hai chục extension nhét cờ cạnh tên người dùng. Mấy cái khác biệt đáng kể thì không nằm trong danh sách tính năng — mà nằm ở chuyện cache chung được phép làm gì, và ở chuyện gì xảy ra khi năm mươi lượt tra cứu của X hết sạch.',
    body: 'Cái này tự giữ nhịp theo hạn mức thật lấy từ chính response header của X và chừa lại mười lượt cho tài khoản bạn rê chuột, nên một thread đông vẫn điền xong thay vì đứng giữa chừng. Bảng đầy đủ có mười bốn dòng và chỉ đích danh ba thứ X-Posed làm tốt hơn extension này.',
    link: 'Xem so sánh đầy đủ →',
  },

  cta: {
    heading: 'Đừng đoán timeline đến từ đâu nữa.',
    body: 'Miễn phí, cài xong là chạy. Khỏi tạo tài khoản gì hết.',
  },

  faq: {
    heading: 'Mấy câu người ta hỏi thật',
  },

  footer: {
    tagline:
      'Một lá cờ nước trên mỗi hồ sơ X, lấy từ dữ liệu của chính X. Một người làm, không có công ty nào phía sau.',
    version: 'Phiên bản',
    notAffiliated:
      'Không liên kết với X Corp. Dữ liệu vị trí từ chính endpoint công khai của X.',
    groupExtension: 'Extension',
    groupGuides: 'Hướng dẫn',
    groupSmallPrint: 'Chữ nhỏ',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Ủng hộ dự án',
    guideAboutAccount: 'Mục “About this account” của X',
    guideEngagementFarming: 'Phát hiện cày tương tác',
    guideRateLimit: 'Giới hạn của X',
    guideComparison: 'So với X-Posed',
    privacyPolicy: 'Chính sách bảo mật',
    whatIsNotCollected: 'Những gì không thu thập',
    contact: 'Liên hệ',
  },

  table: {
    caption: 'X-Pat so với ba extension định vị X được cài nhiều nhất',
    feature: 'Tính năng',
    yes: 'có',
    no: 'không',
    notStated: 'không nêu',
    notApplicable: 'không áp dụng',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'Nước hiển thị ngay trên dòng, không cần mở menu',
        note: 'Đọc từ dữ liệu “About this account” của chính X, không đoán IP.',
      },
      signupSource: {
        label: 'Nguồn đăng ký — Apple, Google Play hay web',
        note: '',
      },
      accountAge: { label: 'Tuổi tài khoản', note: '' },
      handleChanges: { label: 'Số lần đổi tên', note: '' },
      hideByCountry: {
        label: 'Ẩn hoặc thu gọn theo nước và khu vực',
        note: 'Ở đây mặc định thu gọn sau nút “Hiện”, vì timeline lặng lẽ vứt bài là timeline không audit được.',
      },
      allowlist: {
        label: 'Danh sách luôn hiện và ngoại lệ theo luật',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Giữ nhịp theo hạn mức thật trong header rate limit của X',
        note: 'X-Pat đọc header x-rate-limit ở mỗi phản hồi rồi trải các lượt tra cứu lên phần còn lại của cửa sổ, chừa một phần cho tài khoản bạn rê chuột. X-Posed chạy nhịp cố định 150 ms với tám yêu cầu song song, và chỉ đọc header reset sau khi đã dính 429.',
      },
      sharedCache: {
        label: 'Cache chung, để cờ sống qua rate limit',
        note: 'X cho một trình duyệt tầm 50 lần tra hồ sơ mỗi 15 phút. Không có cache chung thì cái trần đó là nguyên trải nghiệm.',
      },
      cacheServerSource: {
        label: 'Công bố mã nguồn server cache',
        note: 'Là server nhận đóng góp, chứ không chỉ extension gửi. Của mình nằm cùng repo, có tài liệu deploy — bạn đọc được, hoặc tự chạy.',
      },
      crossChecked: {
        label: 'Mục cache được đối chiếu chéo giữa các máy',
        note: 'Của mình lưu phiếu theo máy và trả kết quả đồng thuận, có ngưỡng tin cậy bạn nâng được. X-Posed viết là họ lưu giá trị được chấp nhận gần nhất.',
      },
      extensionSource: { label: 'Công bố mã nguồn extension', note: '' },
      testSuite: {
        label: 'Bộ test tự động trong repo',
        note: 'Unit, end-to-end với traffic đã ghi, và visual regression. Con số là cái CI chạy mỗi lần push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'App đồng hành iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed là bên trưởng thành hơn',
        body: 'Tầm 10.000 lượt cài Chrome so với lèo tèo của mình, ra mắt sớm hơn bốn tháng, cache cộng đồng hàng triệu hồ sơ trong khi mình mới vài nghìn. Cache to hơn đồng nghĩa nhiều cờ tức thì hơn ngay ngày đầu. Lợi thế thật và cách biệt không nhỏ.',
      },
      surfaces: {
        title: 'Nó có mặt trên nhiều nền hơn',
        body: 'Firefox desktop, Firefox Android, và app iPhone đồng hành. X-Pat mới chỉ Chromium — Chrome, Edge, Brave, và Kiwi trên Android. Firefox thì có kế hoạch, iOS thì không.',
      },
      languageFilter: {
        title: 'Nó có lọc ngôn ngữ',
        body: 'Bên mình không có, cố ý. Trường ngôn ngữ mỗi bài trên X sai thường xuyên tới mức lọc theo nó làm bài biến mất chẳng hiểu lý do. Đấy là lựa chọn có chủ đích chứ không phải thiếu tính năng — nhưng nếu bạn đến vì muốn lọc ngôn ngữ, X-Posed có còn mình không.',
      },
    },
    notApplicable: '—',
    testCount: '{count} test',
    none: 'không',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Hướng dẫn',
      titleLead: 'Mục',
      titleAccent: '“About this account”',
      titleRest: ' của X, và cách khỏi phải bấm để xem.',
      lead: 'X lặng lẽ biết mỗi tài khoản đăng từ nước nào, và nó cũng sẵn sàng cho bạn biết — từng hồ sơ một, sâu ba cú chạm, nhiêu hồ sơ thì tùy kiên nhẫn của bạn. Đây là vị trí của cái bảng đó, nó trả lời được gì và không được gì, và làm sao khi bạn muốn cùng thông tin ấy cho 80 cái reply thay vì 1.',
      whereHeading: 'Cái bảng nằm ở đâu',
      steps: {
        web: {
          where: 'Web',
          body: 'Mở hồ sơ, rồi menu ⋯ cạnh nút Theo dõi. “About this account” ở trong đó.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Mở hồ sơ, chạm ⋯ ở góc trên bên phải. Cùng một mục, cùng một bảng.',
        },
        what: {
          where: 'Bạn được gì',
          body: 'Nước tài khoản đặt trụ sở, khoảng thời gian tham gia, số lần đổi tên, và kho ứng dụng đăng ký qua.',
        },
      },
      cantHeading: 'Những gì nó không trả lời được',
      cant1:
        'Bảng này từng hồ sơ và dạng modal. Ổn khi bạn rà một tài khoản, vô dụng khi đọc thread reply — mà đấy mới là lúc câu hỏi thường nảy ra. Một trăm reply là một trăm lần ra vào menu, đến lần thứ ba là bạn mất dấu thread mình đang đọc.',
      cant2:
        'Nó cũng không phải lúc nào cũng có dữ liệu. X không trả về nước cho kha khá tài khoản — thường là mấy cái cũ hoặc ít hoạt động. Khi trường đó trống thật thì chẳng có gì để lộ ra, và công cụ nào nói khác là đang đoán IP.',
      cant3:
        'Và nó chẳng nói gì về độ tin cậy. Bên trong X đánh dấu một số vị trí là không dám đảm bảo; cái bảng vẫn hiện ra nước y như thường.',
      sameHeading: 'Cùng trường dữ liệu, không cần menu',
      same1:
        'X-Pat đọc đúng cái trường mà cái bảng đọc — cùng endpoint, dùng phiên X có sẵn trong trình duyệt — rồi vẽ thành lá cờ trong thẻ hover, và tùy chọn thì ngay trên timeline. Không tra IP, không cơ sở dữ liệu bên ngoài, không tài khoản hay API key.',
      same2:
        'Nó trích ba thứ từ response đó: nước, kho ứng dụng đăng ký qua, và việc X có gắn cờ vị trí là không xác minh được hay không — tín hiệu tin cậy cái bảng bỏ qua. Ngày tham gia và lịch sử tên thì giữ nguyên; extension không cố làm nguyên cái bảng.',
      same3:
        'Bạn cũng làm được gì đó dựa trên nó: nước và khu vực không muốn đọc thì thu gọn sau nút “Hiện”, hoặc ẩn. Mặc định là thu gọn, vì timeline lặng lẽ vứt bài là timeline không đáng tin.',
    },

    engagementFarming: {
      kicker: 'Hướng dẫn',
      titleLead: 'Cách phát hiện',
      titleAccent: 'cày tương tác',
      titleRest: ' trên X.',
      lead: 'Từ lúc X trả tiền theo lượt hiển thị, reply thành cái nghề. Nghề lương thấp, và đúng vậy nên thành phẩm trông như thế: nhanh, na ná, dán dưới bất cứ cái gì đang hot. Đây là những tín hiệu thực sự tách reply thật khỏi reply cày.',
      noVerdictHeading: 'Không tín hiệu đơn lẻ nào đủ kết luận',
      noVerdict1:
        'Mỗi dấu hiệu bên dưới đều có cách giải thích vô tội. Tài khoản mới thì là mới. Có người rộng rãi trong chuyện follow. Nhiều người viết tử tế có emoji trong bio. Coi cái nào trong số này là bằng chứng sẽ khiến bạn loại bỏ cả người lạ bình thường, vừa khó chịu vừa vô vị.',
      noVerdict2:
        'Cái hiệu quả là chồng chúng lên. Tài khoản ba tuần tuổi, follow hàng nghìn, được vài chục follow lại, xuất hiện đầu tiên trong reply với câu sáo — tổ hợp đó không phải tình cờ, và bạn nhận ra trong hai giây một khi biết nhìn vào đâu.',
      colSignal: 'Tín hiệu',
      colTell: 'Trông ra sao',
      colCost: 'Tốn công kiểm tra',
      signals: {
        ratio: {
          signal: 'Tỉ lệ follow / được follow',
          tell: 'Follow 4.000, được 40 follow',
          cost: 'Liếc một cái vào thẻ hover',
        },
        age: {
          signal: 'Tuổi tài khoản',
          tell: 'Tham gia ba tuần trước, đã lún sâu vào thread chính trị',
          cost: 'Thẻ hover',
        },
        latency: {
          signal: 'Tốc độ reply',
          tell: 'Reply đầu tiên trong vài giây, từ tài khoản không có lịch sử gì với tác giả',
          cost: 'Dấu thời gian, nếu bạn để ý',
        },
        bio: {
          signal: 'Cấu tạo bio',
          tell: 'Một dãy cờ và emoji chỗ đáng ra là một câu',
          cost: 'Free — nó nằm sờ sờ ra đấy',
        },
        substance: {
          signal: 'Nội dung reply',
          tell: 'Cùng câu sáo bạn đã thấy dưới bốn bài khác hôm nay',
          cost: 'Chủ yếu là trí nhớ',
        },
        location: {
          signal: 'Tài khoản đặt ở đâu',
          tell: 'Lên lớp tự tin về một nước tài khoản chưa từng đăng bài',
          cost: 'Ba chạm, mỗi hồ sơ — hoặc inline',
        },
      },
      hiddenHeading: 'Cái duy nhất bạn không thấy',
      hidden1:
        'Năm trong sáu tín hiệu trên đã nằm sẵn trên màn hình. Số follow, ngày tham gia, bio, bản thân reply — X đưa hết cho bạn không cần hỏi. Cái thứ sáu là cái X giấu sau menu: tài khoản thực sự đăng từ đâu.',
      hidden2:
        'Nó quan trọng hơn mấy cái kia với một kiểu khó chịu rất riêng — không hẳn spam, mà là kiểu dạy đời tự tin về một nơi tài khoản chẳng liên quan. Cảm giác đọc khác hẳn khi bạn thấy được, mà X bắt bạn mở bảng cho từng hồ sơ mới biết.',
      hidden3:
        '<b>X-Pat làm đúng phần đó.</b> Nó nhét nước vào thẻ hover và, nếu bạn muốn, inline trên timeline — kèm cảnh báo khi chính X không xác minh được vị trí. Nó không chấm điểm tài khoản hay phán reply cho bạn; năm tín hiệu kia vẫn là quyết định của bạn. Nó chỉ làm cái dữ kiện bị giấu kia khỏi tốn ba cú chạm.',
    },

    comparison: {
      kicker: 'So sánh',
      titleLead: 'X-Pat và',
      titleAccent: 'X-Posed',
      titleRest: ', cùng mấy cái còn lại.',
      lead: 'Khoảng hai chục extension nhét cờ nước cạnh tên X. Ba cái có số người dùng đáng kể. Đây là từng cái thực sự làm gì, X-Pat làm khác gì, và ba thứ X-Posed làm tốt hơn — phần mà đa số trang so sánh bỏ qua.',
      featureHeading: 'Từng tính năng',
      featureLead:
        'Mỗi ô đến từ store công khai hoặc repo công khai, đọc ngày {date}. Dấu gạch nghĩa là không thấy ghi — với hai extension đóng thì không giống "không", mà vẽ thành "không" là không công bằng.',
      aheadHeading: 'X-Posed dẫn trước ở đâu',
      differsHeading: 'Khác biệt thực sự',
      differs1:
        'Mọi thứ trong mục này phụ thuộc cache chung. X cho một trình duyệt tầm năm chục lần tra mỗi mười lăm phút, mà thread sôi nổi thì hơn hẳn — nên extension nào ở đây chạy qua giới hạn là nhờ đọc cache người khác đổ đầy. Câu hỏi không phải có server hay không. Mà là server đó được làm gì.',
      differs2:
        '<b>Của mình công khai, và bạn tự chạy được.</b> Server cache cùng repo với extension, có tài liệu deploy cho Cloudflare Workers và VPS thường. X-Posed công bố extension — thật, MIT hẳn hoi — nhưng không công bố Worker nhận đóng góp. Đó là mảnh bạn không kiểm tra được bằng code mình đã cài.',
      differs3:
        '<b>Một câu trả lời từ cache ở đây cần đối chứng.</b> Đóng góp lưu dưới dạng phiếu theo máy và cái được trả là đồng thuận, có ngưỡng tin cậy bạn nâng được trong tùy chọn. Tài liệu của X-Posed mô tả lưu giá trị được chấp nhận gần nhất, nghĩa là người góp mới nhất quyết. Cả hai thiết kế đều thừa nhận vấn đề gốc: không server nào chứng minh được đóng góp thực sự tới từ X.',
      differs4:
        '<b>Tra cứu không mang định danh.</b> Lượt đọc là danh sách tên không ký, nên server chẳng có gì để ghép và không thể dựng kiểu "máy này đã xem mấy tài khoản này". Đếm người đọc tốn một dòng code và sẽ phá cái tính chất đó, thành ra số liệu công bố cố ý đếm thiếu.',
      differs5:
        'Và rate limit được chia khẩu phần chứ không chạy đua: tác vụ nền dừng ở 80% cửa sổ, nên mười lần cuối vẫn còn cho tài khoản bạn rê chuột. <a href="{href}">Cơ chế vẽ rõ ở trang chủ</a>.',
      sourcesHeading: 'Nguồn',
      sourcesLead:
        'Đọc ngày {date}. Số cài và tính năng thay đổi; nếu bên dưới có gì cũ là lỗi chứ không phải lập trường, và <a href="{href}">issue tracker</a> là cách nhanh nhất để sửa.',
      sourceLabel: ' — nguồn: ',
      sourceNotPublished: ' — không công bố mã nguồn',
    },
  },

  pages: {
    home: {
      title: 'X-Pat — Định vị hồ sơ X: xem nước của mọi hồ sơ X',
      description:
        'Một lá cờ nước trên mỗi hồ sơ X, từ dữ liệu của chính X. Cảnh báo VPN, ẩn hoặc đánh dấu bài theo nước, tổ chức, tuổi hoặc từ khóa bio. Miễn phí cho Chrome.',
      faq: [
        {
          q: 'Làm sao để xem tài khoản X đến từ nước nào?',
          a: 'X lưu một nước cho mỗi tài khoản và hiện nó trong “About this account”, nhưng mỗi lần một hồ sơ và chỉ khi bạn mở menu. Extension này đọc đúng trường đó và nhét thẳng cờ vào thẻ hover và timeline, bạn thấy mà khỏi bấm gì.',
        },
        {
          q: 'Có biết được tài khoản X đang dùng VPN không?',
          a: 'X gắn cờ một số tài khoản có vị trí không xác minh được. Extension hiển thị thành huy hiệu ⚠ VPN cạnh cờ. Nghĩa là chính X không chắc về nước đó, chứ không chứng minh được có VPN.',
        },
        {
          q: 'Ẩn hoặc thu gọn tweet từ một số nước được không?',
          a: 'Được. Chọn nước hoặc vùng trong tùy chọn rồi chọn tweet khớp thì thu gọn sau nút “Hiện” hay biến mất. Mặc định là thu gọn, không có gì lặng lẽ biến mất khỏi timeline.',
        },
        {
          q: 'Lọc theo cái gì khác ngoài nước được không?',
          a: 'Được. Chặn mọi tài khoản X gắn nhãn thuộc tổ chức, đánh dấu tài khoản non hơn mốc bạn chọn, và highlight tài khoản có tên hoặc bio khớp từ khóa — hoặc bio toàn cờ. Luật tuổi và từ khóa chỉ đánh dấu, không vứt đi. Danh sách cho phép và ngoại lệ theo luật lo cho tài khoản bạn muốn tha.',
        },
        {
          q: 'Có cần mật khẩu X hay API key không?',
          a: 'Không cần. Nó dùng lại phiên X có sẵn trong trình duyệt để gửi cùng request như khi site hiện hồ sơ. Không login, không API key, không tài khoản của chúng tôi.',
        },
        {
          q: 'Vị trí có chính xác không?',
          a: 'Chính xác y như dữ liệu X, vì là dữ liệu của X. Extension không đoán IP hay hỏi cơ sở dữ liệu ngoài. Chỗ nào X gắn cờ vị trí chưa xác minh, extension cũng vậy.',
        },
      ],
    },

    aboutThisAccount: {
      title: '“About this account” trên X: xem ở đâu, xem sao cho nhanh',
      description:
        'X hiện nước của mỗi tài khoản dưới “About this account” — từng hồ sơ, sau menu. Đây là chỗ tìm, và cách lấy nó inline.',
      faq: [
        {
          q: '“About this account” trên X là gì?',
          a: 'Bảng X thêm vào, cho biết tài khoản đặt ở đâu, tham gia lúc nào, đổi tên bao lần, và đăng ký qua kho ứng dụng nào. Cùng trường nước extension này đọc.',
        },
        {
          q: '“About this account” ở đâu?',
          a: 'Mở hồ sơ, chạm menu ⋯ góc trên bên phải, chọn “About this account”. Trên web nó cùng menu đó cạnh nút Theo dõi.',
        },
        {
          q: 'Sao không thấy “About this account” với một số người?',
          a: 'X không trả về nước cho mọi tài khoản — mấy cái cũ hoặc ít dùng thường không có. Trống thật thì không công cụ nào điền được, kể cả cái này.',
        },
        {
          q: 'Làm sao xem nước mà không phải mở từng hồ sơ?',
          a: 'Đó là chỗ trống extension này lấp. Nó đọc cùng trường và vẽ thành cờ trong thẻ hover, và tùy chọn trên timeline — nên lướt thread 80 reply không có nghĩa 80 lần vào menu.',
        },
      ],
    },

    engagementFarming: {
      title: 'Cách phát hiện cày tương tác và reply rác trên X',
      description:
        'Tín hiệu tách reply thật khỏi reply cày trên X: tuổi tài khoản, tỉ lệ follow, thói quen đăng, và nơi tài khoản thực đặt.',
      faq: [
        {
          q: 'Cày tương tác trên X là gì?',
          a: 'Đăng reply cốt gặt lượt hiển thị chứ không nói gì — đồng tình chung chung, phẫn nộ tái chế, hoặc câu sáo dán dưới bài đang hot. Từ khi X trả tiền theo lượt hiển thị, có động cơ tài chính đàng hoàng.',
        },
        {
          q: 'Làm sao biết reply là của bot hay tài khoản cày?',
          a: 'Không tín hiệu đơn lẻ nào đủ. Mấy cái có ích chồng lên: tài khoản follow hàng nghìn, được vài chục follow, mới tạo vài tuần, reply trong vài giây cho tài khoản lớn, bio toàn cờ với emoji. Từng cái riêng thì bình thường; ba cái cùng lúc thì hiếm khi.',
        },
        {
          q: 'Tỉ lệ follow nào đáng nghi?',
          a: 'Follow nhiều hơn hẳn được follow — tỉ lệ dưới 0,1 — là kiểu kinh điển, vì follow hàng loạt là cách rẻ nhất để được chú ý. Nhiều tài khoản mới bình thường cũng vậy, coi là một dữ kiện chứ không kết luận.',
        },
        {
          q: 'Extension có phát hiện cày tương tác không?',
          a: 'Không trực tiếp. Nó hiện nước và trạng thái VPN inline, tín hiệu duy nhất bạn không thấy nếu không mở từng hồ sơ. Mấy tín hiệu khác vẫn là phán đoán của bạn.',
        },
      ],
    },

    rateLimit: {
      title: 'Giới hạn của X: 50 lượt tra cứu hồ sơ mỗi 15 phút',
      description:
        'X cho mỗi trình duyệt khoảng 50 lượt tra cứu tài khoản mỗi 15 phút. X-Pat phân bổ hạn mức đó ra sao, và vì sao hầu hết hồ sơ không tốn lượt nào.',
      faq: [],
    },

    comparison: {
      title: 'Thay thế X-Posed: so sánh X-Pat từng tính năng',
      description:
        'So sánh thẳng thắn X-Pat với X-Posed và hai extension định vị X còn lại — gồm cả ba thứ X-Posed làm tốt hơn.',
      faq: [
        {
          q: 'Thay thế X-Posed nào tốt nhất?',
          a: 'Tùy bạn cần gì. X-Posed lâu đời nhất, có lọc ngôn ngữ, bản Firefox và app iPhone mà X-Pat không có. X-Pat khác ở cache chung: server công khai và tự host được, mục cache đối chiếu chéo giữa các máy trước khi trả, và tra cứu không mang định danh để server dựng hồ sơ bạn đã xem gì.',
        },
        {
          q: 'X-Pat có mã nguồn mở không?',
          a: 'Có, MIT, và cả server cache — cùng repo, có tài liệu deploy Cloudflare Workers với VPS. X-Posed cũng MIT cho extension; cái không công bố là Worker nhận đóng góp cache.',
        },
        {
          q: 'Mấy extension này có cần mật khẩu X không?',
          a: 'Không cái nào ở đây cần. Chúng dùng phiên X đang mở trong trình duyệt để gửi cùng request X gửi khi hiện hồ sơ. Không login, không API key, không tài khoản bên thứ ba.',
        },
        {
          q: 'Sao cờ ngừng hiện giữa chừng thread?',
          a: 'X cho một trình duyệt tầm 50 lần tra mỗi 15 phút, thread sôi nổi hơn thế. Extension đụng trần thì ngừng điền cờ. Cache chung tránh được — đa số hồ sơ không tốn lượt vì người khác tra rồi — và X-Pat chừa 20% cuối cửa sổ cho tài khoản bạn tự rê.',
        },
      ],
    },
  },
}
