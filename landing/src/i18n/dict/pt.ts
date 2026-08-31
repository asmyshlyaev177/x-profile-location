import type { Dict } from './en'

/** Portuguese, Brazilian. "Você" throughout; Brazil is the audience, not Portugal. */
export const pt: Dict = {
  nav: {
    sections: 'Seções',
    screenshots: 'Capturas',
    howItWorks: 'Como funciona',
    features: 'Recursos',
    privacy: 'Privacidade',
    comparison: 'Comparação',
    sourceOnGitHub: 'Código no GitHub',
    home: 'X-Pat — início',
  },

  language: {
    label: 'Idioma',
    choose: 'Escolha um idioma',
  },

  install: {
    chrome: 'Adicionar ao Chrome',
    edge: 'Adicionar ao Edge',
    brave: 'Adicionar ao Brave',
  },

  hero: {
    titleLead: 'Veja de onde qualquer perfil',
    titleAccent: 'realmente é',
    lead: 'O X já sabe de que país cada conta publica. Só não te mostra. Esta extensão coloca a bandeira no cartão de perfil e deixa você recolher ou esconder os países que prefere não ver.',
    seeItRunning: 'Ver funcionando',
    railWorksIn: 'Funciona no',
    railAndroid: 'No Android',
    railAccount: 'Conta / chave de API',
    railAccountValue: 'Nenhum',
    railVersion: 'Versão',
    panelFollowing: 'Seguindo',
    panelFollowers: 'Seguidores',
    panelHidden: '🚫 Oculto · 🇮🇳 Índia',
    panelShow: 'Mostrar',
  },

  screenshots: {
    heading: 'É isso aqui, rodando dentro do X.',
    lead: 'Capturas de uma timeline comum. Escolha uma para ver como funciona.',
    fullSize: 'Tamanho real',
    viewer: 'Visualizador de capturas',
    close: 'Fechar',
    prev: 'Captura anterior',
    next: 'Próxima captura',
    railLabel: 'Capturas de tela',
    shots: {
      copy: {
        label: 'Copiar como imagem',
        alt: 'Um cartão de hover com botões Post e Sobre ao lado da bandeira, e ao lado a página Sobre esta conta copiada como imagem',
      },
      hover: {
        label: 'Bandeira ao passar o mouse',
        alt: 'Um cartão do X com uma bandeira alemã e a palavra Alemanha abaixo do @',
      },
      vpn: {
        label: 'Aviso de VPN',
        alt: 'Um cartão mostrando a bandeira dos EUA ao lado de um selo vermelho ⚠ VPN',
      },
      feed: {
        label: 'Bandeiras na timeline',
        alt: 'Uma timeline em que cada autor exibe a bandeira do seu país no próprio post, sem precisar passar o mouse',
      },
      blocked: {
        label: 'Oculto no feed',
        alt: 'Uma linha do tempo com uma publicação recolhida atrás de uma barra “🚫 Oculto · Egito” e um botão Mostrar',
      },
      keyword: {
        label: 'Destaque por palavra-chave',
        alt: 'Um tweet destacado em âmbar porque a bio do autor bateu com uma palavra-chave salva',
      },
      flagBios: {
        label: 'Bios entupidas de bandeiras',
        alt: 'Uma conta sinalizada por enfiar bandeira de país demais na bio',
      },
      swipe: {
        label: 'Deslize no celular',
        alt: 'Uma timeline em largura de celular onde deslizar para a direita revela o país do autor como sobreposição',
      },
    },
  },

  howItWorks: {
    heading: 'De onde a bandeira realmente sai',
    lead: 'Toda conta no X tem um país cadastrado. O X esconde isso atrás de um menu que quase ninguém abre. Aqui nada tenta adivinhar por IP nem consulta base de dados de terceiros.',
    steps: {
      hover: {
        title: 'Você passa o mouse em um perfil',
        body: 'Ou desliza um tweet para a direita, se estiver no celular. Não precisa abrir página de configuração nenhuma; a consulta acontece onde seu cursor já está.',
        readoutKey: 'Gatilho',
        readoutValue: 'mouse · deslize · timeline',
      },
      ask: {
        title: 'Seu navegador pergunta direto para o X',
        body: 'Ele usa a sessão que você já tem aberta para fazer exatamente a mesma requisição que o site faz ao mostrar uma conta. Nada nosso fica no meio.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'A bandeira aparece no cartão',
        body: 'Seu navegador guarda a resposta por 30 dias. A segunda consulta sai de graça. Tem um botão na página de opções que limpa tudo.',
        readoutKey: 'Cache',
        readoutValue: 'local · 30 dias',
      },
    },
  },

  rateBudget: {
    link: 'Como funciona o orçamento',
    heading: 'O limite do X, contornado em vez de estourado.',
    lead: 'Você já viu isso acontecer. O começo da thread carrega e de repente trava. Esse é o limite: cinquenta consultas de conta a cada quinze minutos, e uma thread movimentada tem mais contas do que isso.',
    body: 'Aqui a maioria dos perfis não gasta consulta. Já estão em cache, ou alguém já consultou e o cache compartilhado responde. O resto é racionado.',
    closing:
      'Se mesmo assim você esgotar, aparece uma contagem regressiva até a renovação, não uma bandeira em branco. A fatia e o ritmo são você quem define.',
    facts: {
      real: {
        title: 'O número real',
        body: 'O limite sai dos próprios cabeçalhos de resposta do X, não de um chute fixo na hora da build. Suas passadas de mouse também entram na conta.',
        readoutKey: 'Fonte',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Dosado, não disparado de uma vez',
        body: 'Mais ou menos uma consulta a cada 22 segundos, recalculada sempre — alivia quando você passa muito o mouse, aperta quando a janela vai recompondo.',
        readoutKey: 'Ritmo',
        readoutValue: 'janela ÷ limite',
      },
      hovers: {
        title: 'O mouse sempre tem prioridade',
        body: 'O trabalho em segundo plano para nos 80%, então o resto da janela fica reservado para as contas em que você realmente passar o mouse.',
        readoutKey: 'Reservado',
        readoutValue: '10 de 50',
      },
    },
    bar: {
      caption: 'Uma janela de 15 minutos',
      alt: 'Cinquenta consultas por janela: quarenta disponíveis para pré-carregamento em segundo plano, dez reservadas para as contas em que você passa o mouse.',
      backgroundNote:
        'em segundo plano, pingadas ao longo dos quinze minutos inteiros',
      reservedNote:
        'seguradas, para que passar o mouse nunca seja justo a consulta que te deixa na mão',
    },
  },

  features: {
    heading: 'Um dado, e o que você faz com ele.',
    lead: 'Funciona nos cartões de perfil, nas páginas de perfil, em tweets soltos e na timeline. Não precisa configurar nada antes.',
    readings: {
      country: {
        name: 'País',
        body: 'O país de onde a conta publica. Aparece no cartão e, se você ativar, na timeline também.',
      },
      region: {
        name: 'Região',
        body: 'Às vezes o X informa uma região em vez de um país. Você recebe o código curto: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'O X pode marcar uma localização como suspeita. O país continua aparecendo; você só fica sabendo que é melhor não confiar tanto.',
      },
      registration: {
        name: 'Cadastro',
        body: 'Por qual loja de aplicativos a conta foi criada. Em geral, o sinal mais confiável dos dois.',
      },
      cooldown: {
        name: 'Tempo de espera',
        body: 'O X limita quantas consultas você pode fazer em 15 minutos. Se bater no teto, uma contagem regressiva avisa quando libera, em vez de você ficar sem entender por que a bandeira sumiu.',
      },
    },
    hide: {
      title: 'Esconda os países que você prefere não ver.',
      p1: 'Quando você consegue enxergar de onde vem uma publicação, dá para agir. Escolha os países que quer pular e decida o que acontece com os tweets deles.',
      p2: 'Recolher é o padrão. O tweet vira uma barra fina <b>🚫 Oculto · 🇮🇳 Índia</b> com um botão Mostrar, então você ainda percebe que tinha algo ali, e um clique traz de volta de vez. O filtro segue o país da loja de aplicativos quando existe um, e não mexe no tweet que você abriu de propósito.',
      p3: 'País não é a única alavanca que você tem. Bloqueie uma organização e todas as contas que o X marca como dela somem também. Contas mais novas do que o limite que você definir são marcadas assim que aparecem — marcadas, nunca ocultas, porque ser nova não prova nada.',
      readoutCollapse: 'Recolher',
      readoutCollapseValue: 'Barra fina + Mostrar',
      readoutHide: 'Ocultar',
      readoutHideValue: 'Removido de vez',
      readoutOff: 'Desligado',
      readoutOffValue: 'Só bandeiras',
      previewRemoved: 'tweet removido',
    },
    highlight: {
      title: 'Marque as contas que você quer reconhecer de longe.',
      p1: 'Salve algumas palavras-chave e qualquer tweet cujo autor bater ganha uma borda âmbar, com as palavras encontradas ao lado do @. Bios entupidas de bandeiras são pegas do mesmo jeito, a partir da quantidade que você achar que é demais.',
      p2: 'As regras ficam na página de opções da extensão, junto com as exceções: uma lista de permissão para contas que nenhuma regra pode tocar, e exceções por regra para a conta que você quer poupar da palavra-chave mas não do país.',
      readoutMatch: 'Buscar em',
      readoutMatchValue: 'Nome · bio',
      readoutFlags: 'Qtd. de bandeiras',
      readoutFlagsValue: 'Seu limite',
      readoutExceptions: 'Exceções',
      readoutExceptionsValue: 'Por conta',
      optionsTitle: 'Opções',
      optionsSaved: 'salvo',
      optionsByKeyword: 'Destacar por palavra-chave 🔍',
      optionsByFlags: 'Destacar por bandeiras 🏴',
      optionsPlaceholder: 'Digite uma palavra-chave…',
    },
    cache: {
      title: 'Um cache que todo mundo abastece',
      p1: 'As bandeiras que você consulta e as que outras pessoas consultam caem no mesmo lugar. Por isso a maioria dos perfis aparece na hora, sem gastar consulta. Daqui só sai o @ público e a bandeira dele. Sua conta, seus cookies, as bios e seu histórico não.',
      p2: 'Um botão desliga isso tudo, e desligar também interrompe as consultas em segundo plano. Depois disso a extensão só fala com o X, e somente quando você pede.',
      contributors: 'colaboradores',
      shared: 'compartilhadas',
      instant: '⚡ na hora',
    },
    swipe: {
      title: 'E no celular, um deslize',
      p1: 'Deslize qualquer tweet para a direita para buscar a localização do autor. Dispara no meio do gesto, sem esperar você levantar o dedo, e uma sobreposição informa o país.',
      p2: 'No Android você precisa de um navegador que rode extensões de desktop. <b>{browser}</b> é aquele em que isso foi testado.',
    },
  },

  trust: {
    heading: 'Uma extensão que lê sua sessão do X tem que ser bem específica.',
    lead: 'Então vamos lá. As consultas vão direto para x.com, do mesmo jeito que as requisições do próprio site, e nunca passam por um servidor nosso. Seu navegador guarda os resultados por 30 dias, e a página de opções limpa quando você quiser.',
    body: 'Não tem analytics nem telemetria dentro da extensão. Este site usa Google Analytics, para contar visitas e saber qual botão de instalação foi clicado — só isso.',
    readPolicy: 'Ler a política de privacidade completa',
    neverTitle: 'Nunca enviado a lugar nenhum',
    neverNote:
      'Não existe configuração para isso. A extensão nunca lê essas coisas.',
    never: [
      'Sua conta do X, cookies ou tokens de sessão',
      'Bios, nomes de exibição ou o que quer que você leia',
      'Seu histórico de navegação ou sua atividade no X',
      'Qualquer coisa que identifique você pessoalmente',
    ],
    optTitle: 'Só com o cache ligado',
    optNote:
      'Um único botão na página de opções controla isso. Desligue e nada sai.',
    optional: [
      'O @ público que você consultou, por exemplo @jack',
      'Os dados de bandeira: localização, origem, indicador de VPN',
      'Um ID de instalação aleatório, para que a mesma bandeira enviada por pessoas diferentes conte uma vez só',
    ],
  },

  compareTeaser: {
    heading: 'Já usa alguma das outras?',
    lead: 'Cerca de vinte extensões colocam uma bandeira ao lado de um @. As diferenças que importam não estão na lista de recursos — estão no que o cache compartilhado tem permissão para fazer, e no que acontece quando as cinquenta consultas do X acabam.',
    body: 'Esta aqui se ritma pelo orçamento real que vem nos cabeçalhos de resposta do X e guarda dez consultas para as contas em que você passa o mouse, então uma thread cheia termina de preencher em vez de parar no meio. A tabela completa tem catorze linhas e mostra as três coisas que o X-Posed faz melhor do que esta extensão.',
    link: 'Ver a comparação completa →',
  },

  cta: {
    heading: 'Pare de adivinhar de onde vem a sua timeline.',
    body: 'Grátis, e funciona no instante em que instala. Não precisa criar conta.',
  },

  faq: {
    heading: 'Perguntas que as pessoas realmente fazem',
  },

  footer: {
    tagline:
      'Uma bandeira de país em cada perfil do X, tirada dos dados do próprio X. Feito por uma pessoa só, sem empresa por trás.',
    version: 'Versão',
    notAffiliated:
      'Sem vínculo com a X Corp. Os dados de localização vêm dos endpoints públicos do próprio X.',
    groupExtension: 'A extensão',
    groupGuides: 'Guias',
    groupSmallPrint: 'Letras miúdas',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Apoie o projeto',
    guideAboutAccount: 'X "Sobre esta conta"',
    guideEngagementFarming: 'Como identificar engagement farming',
    guideRateLimit: 'O limite do X',
    guideComparison: 'Comparado ao X-Posed',
    privacyPolicy: 'Política de privacidade',
    whatIsNotCollected: 'O que não é coletado',
    contact: 'Contato',
  },

  table: {
    caption:
      'X-Pat comparado às três extensões de localização do X mais instaladas',
    feature: 'Recurso',
    yes: 'sim',
    no: 'não',
    notStated: 'não informado',
    notApplicable: 'não se aplica',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'País exibido na hora, sem abrir menu',
        note: 'Lido dos dados de "Sobre esta conta" do próprio X, não adivinhado por endereço de IP.',
      },
      signupSource: {
        label: 'Origem do cadastro — Apple, Google Play ou web',
        note: '',
      },
      accountAge: { label: 'Idade da conta', note: '' },
      handleChanges: {
        label: 'Número de trocas de @',
        note: '',
      },
      hideByCountry: {
        label: 'Ocultar ou recolher por país e região',
        note: 'Recolher atrás de um botão "Mostrar" é o padrão aqui, porque uma timeline que descarta publicações em silêncio é uma timeline que você não consegue auditar.',
      },
      allowlist: {
        label: 'Lista de sempre-mostrar e exceções por regra',
        note: '',
      },
      budgetFromHeaders: {
        label: 'Ritma pelo orçamento real dos cabeçalhos de limite do X',
        note: 'O X-Pat lê os cabeçalhos x-rate-limit em cada resposta e distribui suas consultas pelo que sobrou da janela, guardando uma parte para as contas em que você passa o mouse. O X-Posed usa um intervalo fixo de 150 ms com oito requisições em paralelo e só lê o cabeçalho de reset depois de um 429.',
      },
      sharedCache: {
        label: 'Cache compartilhado, para as bandeiras sobreviverem ao limite',
        note: 'O X permite a um navegador cerca de 50 consultas de perfil a cada 15 minutos. Sem cache compartilhado, esse teto define a experiência inteira.',
      },
      cacheServerSource: {
        label: 'Código do servidor de cache publicado',
        note: 'O servidor que recebe as contribuições, não só a extensão que as envia. O nosso está no mesmo repositório, com documentação de deploy — dá para ler, ou para rodar o seu.',
      },
      crossChecked: {
        label: 'Entradas do cache conferidas entre instalações',
        note: 'Aqui cada instalação vota e o consenso é servido, com um limite de confiança que você pode aumentar. O X-Posed documenta que guarda o último valor aceito para um @.',
      },
      extensionSource: {
        label: 'Código da extensão publicado',
        note: '',
      },
      testSuite: {
        label: 'Suíte de testes automatizados no repositório',
        note: 'Testes unitários, ponta a ponta contra tráfego gravado e regressão visual. O número é o que o CI roda a cada push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'App complementar para iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'O X-Posed é o mais maduro',
        body: 'Cerca de 10.000 instalações no Chrome contra o nosso punhado, quatro meses de vantagem, e um cache comunitário com milhões de perfis onde o nosso tem milhares. Um cache maior significa, na prática, mais bandeiras instantâneas no primeiro dia. Essa vantagem é real e a distância nem se compara.',
      },
      surfaces: {
        title: 'Ele roda em mais lugares',
        body: 'Firefox no desktop, Firefox para Android e um app complementar para iPhone. O X-Pat hoje é só Chromium — Chrome, Edge, Brave e Quetta no Android. Firefox está nos planos, iOS não.',
      },
      languageFilter: {
        title: 'Ele tem filtro por idioma',
        body: 'Nós não temos, e é de propósito. O campo de idioma por publicação do X erra com frequência suficiente para que filtrar por ele faça publicações sumirem sem motivo visível. É uma escolha defensável, não uma lacuna — mas se o que você busca é filtro por idioma, o X-Posed tem e nós não.',
      },
    },
    notApplicable: '—',
    testCount: '{count} testes',
    none: 'nenhum',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Guia',
      titleLead: 'O painel',
      titleAccent: '"Sobre esta conta"',
      titleRest: ' do X, e como parar de clicar para chegar nele.',
      lead: 'O X sabe muito bem de que país cada conta publica, e até te conta — um perfil por vez, três toques de profundidade, quantos a sua paciência aguentar. Aqui está onde fica esse painel, o que ele consegue e o que não consegue responder, e o que fazer quando você quer o mesmo dado para oitenta respostas em vez de uma.',
      whereHeading: 'Onde o painel realmente fica',
      steps: {
        web: {
          where: 'Web',
          body: 'Abra o perfil e vá no menu ⋯ ao lado do botão Seguir. "Sobre esta conta" está nessa lista.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Abra o perfil e toque no ⋯ no canto superior direito do cabeçalho. Mesma entrada, mesmo painel.',
        },
        what: {
          where: 'O que você recebe',
          body: 'O país onde a conta está baseada, mais ou menos quando ela entrou, quantas vezes o @ mudou e por qual loja de aplicativos ela se cadastrou.',
        },
      },
      cantHeading: 'O que ele não consegue responder',
      cant1:
        'O painel é por perfil e modal. Ótimo para checar uma conta, um desastre para ler uma thread de respostas, que é justamente quando a dúvida aparece. Cem respostas são cem idas e vindas por um menu, e na terceira você já perdeu o fio da thread.',
      cant2:
        'E nem sempre vem preenchido. O X não devolve país para um bom número de contas — em geral as mais antigas ou pouco ativas. Quando o campo está realmente vazio, não tem o que revelar, e qualquer ferramenta que diga o contrário está chutando por endereço de IP.',
      cant3:
        'E não diz nada sobre confiabilidade. Internamente o X marca algumas localizações como não verificáveis; o painel mostra o país do mesmo jeito.',
      sameHeading: 'O mesmo campo, sem o menu',
      same1:
        'O X-Pat lê exatamente o campo que o painel lê — o mesmo endpoint, usando a sessão do X que você já tem no navegador — e desenha como bandeira no cartão e, se quiser, direto na timeline. Sem consulta de IP, sem banco de dados de terceiros, sem conta nem chave de API.',
      same2:
        'Ele extrai três coisas dessa resposta: o país, a loja de aplicativos pela qual a conta se cadastrou, e se o X sinaliza a localização como duvidosa — o indicador de confiança que o painel omite. Data de criação e histórico de @ ficam onde estão; a extensão não tenta ser o painel inteiro.',
      same3:
        'E você pode agir a partir disso: países e regiões que prefere não ver podem recolher atrás de um botão "Mostrar", ou sumir de vez. Recolher é o padrão, porque uma timeline que descarta publicações em silêncio é uma timeline em que você não pode confiar.',
    },

    engagementFarming: {
      kicker: 'Guia',
      titleLead: 'Como identificar',
      titleAccent: 'engagement farming',
      titleRest: ' no X.',
      lead: 'Desde que o X começou a pagar por impressões, responder virou profissão. Mal paga, o que explica direitinho a cara do resultado: rápido, genérico e colado embaixo do que estiver bombando. Aqui estão os sinais que realmente separam uma resposta genuína de uma cultivada.',
      noVerdictHeading: 'Nenhum sinal isolado é conclusivo',
      noVerdict1:
        'Cada pista abaixo tem uma explicação inocente. Contas novas são novas. Tem gente que segue com generosidade. Muita gente que escreve bem tem emoji na bio. Tratar qualquer um desses sinais como prova vai fazer você descartar desconhecidos perfeitamente normais, o que é desagradável e ainda por cima chato.',
      noVerdict2:
        'O que funciona é empilhar. Uma conta de três semanas, seguindo milhares, seguida por dezenas, primeira nas respostas com uma frase pronta — essa combinação não é coincidência, e você lê tudo em dois segundos quando sabe onde olhar.',
      colSignal: 'Sinal',
      colTell: 'Qual é a cara',
      colCost: 'Custo para checar',
      signals: {
        ratio: {
          signal: 'Proporção seguidores / seguindo',
          tell: 'Seguindo 4.000, seguida por 40',
          cost: 'Uma olhada no cartão',
        },
        age: {
          signal: 'Idade da conta',
          tell: 'Entrou há três semanas, já no meio de threads políticas',
          cost: 'Cartão',
        },
        latency: {
          signal: 'Rapidez da resposta',
          tell: 'Primeira resposta em segundos, de uma conta sem nenhum histórico com o autor',
          cost: 'O horário da postagem, se você fizer questão de olhar',
        },
        bio: {
          signal: 'Composição da bio',
          tell: 'Uma fileira de bandeiras e emojis no lugar de uma frase',
          cost: 'De graça — está bem ali',
        },
        substance: {
          signal: 'Conteúdo da resposta',
          tell: 'A mesma frase pronta que você já viu em outras quatro publicações hoje',
          cost: 'Memória, basicamente',
        },
        location: {
          signal: 'De onde a conta publica',
          tell: 'Dando aula com autoridade sobre um país de onde a conta nunca publicou',
          cost: 'Três toques, por perfil — ou na hora',
        },
      },
      hiddenHeading: 'O que você não consegue ver',
      hidden1:
        'Cinco desses seis sinais já estão na tela. Contagem de seguidores, data de criação, a bio, a própria resposta — o X entrega tudo isso sem você pedir. O sexto é o que o X guarda atrás de um menu: de onde a conta realmente publica.',
      hidden2:
        'Esse pesa mais que os outros para um tipo específico de incômodo — não exatamente spam, mas aula com pose de autoridade sobre um lugar onde a conta não tem nada em jogo. A leitura muda completamente quando você consegue ver, e o X te obriga a abrir um painel por perfil para descobrir.',
      hidden3:
        '<b>O X-Pat faz essa parte.</b> Ele coloca o país no cartão e, se você quiser, direto na timeline — além de um aviso quando nem o próprio X consegue verificar a localização. Ele não dá nota para contas nem julga respostas por você; os outros cinco sinais continuam sendo por sua conta. Ele só impede que o único dado genuinamente escondido custe três toques.',
    },

    comparison: {
      kicker: 'Comparação',
      titleLead: 'X-Pat vs',
      titleAccent: 'X-Posed',
      titleRest: ', e o resto da prateleira.',
      lead: 'Cerca de vinte extensões colocam uma bandeira de país ao lado de um @ do X. Três delas têm um número relevante de usuários. Aqui está o que cada uma realmente faz, o que o X-Pat faz diferente, e as três coisas que o X-Posed faz melhor — exatamente a parte que a maioria das páginas de comparação deixa de fora.',
      featureHeading: 'Recurso por recurso',
      featureLead:
        'Cada célula vem da página pública da loja ou do repositório público, lidos em {date}. Um traço significa que a página não diz — para as duas extensões de código fechado isso não equivale a um não, e seria injusto desenhar como tal.',
      aheadHeading: 'Onde o X-Posed está na frente',
      differsHeading: 'O que realmente difere',
      differs1:
        'Tudo nesta categoria depende de um cache compartilhado. O X permite a um navegador cerca de cinquenta consultas de perfil a cada quinze minutos, e uma thread movimentada tem mais contas que isso — então toda extensão desta lista que continua funcionando depois do limite faz isso lendo um cache que outras pessoas preencheram. A pergunta não é se existe um servidor. É o que esse servidor tem permissão para fazer.',
      differs2:
        '<b>O nosso é publicado, e você pode rodar o seu.</b> O servidor de cache está no mesmo repositório da extensão, com documentação de deploy para Cloudflare Workers e para um VPS comum. O X-Posed publica a extensão dele — de verdade, sob licença MIT — mas não publica o Worker para onde vão as contribuições. É exatamente a peça que você não consegue verificar lendo o código que instalou.',
      differs3:
        '<b>Aqui uma resposta em cache precisa de corroboração.</b> As contribuições são guardadas como votos por instalação e o que é servido é o consenso, com um limite de confiança que você pode aumentar nas opções. A documentação do X-Posed descreve que guarda o último valor aceito para um @, ou seja, quem contribuiu por último decide. Ambos os modelos são honestos sobre o mesmo problema de fundo: nenhum servidor consegue provar que uma contribuição veio mesmo do X.',
      differs4:
        '<b>As consultas não carregam identificador.</b> As leituras são uma lista de @ sem assinatura, então o servidor não tem nada para cruzar e não consegue montar um "esta instalação olhou estas contas". Contar leitores levaria uma linha de código e acabaria com essa propriedade, e é por isso que as estatísticas publicadas propositalmente subestimam.',
      differs5:
        'E o limite é racionado em vez de disputado: o trabalho em segundo plano para em oitenta por cento da janela, então as últimas dez consultas continuam disponíveis para as contas em que você realmente passa o mouse. <a href="{href}">O mecanismo está desenhado na página inicial</a>.',
      sourcesHeading: 'Fontes',
      sourcesLead:
        'Lido em {date}. Números de instalação e recursos mudam; se algo abaixo estiver desatualizado, é erro, não posição, e o <a href="{href}">rastreador de issues</a> é o jeito mais rápido de mandar corrigir.',
      sourceLabel: ' — fonte: ',
      sourceNotPublished: ' — código não publicado',
    },
  },

  pages: {
    home: {
      title:
        'X-Pat — Localização de perfil no X: veja o país de qualquer perfil',
      description:
        'Uma bandeira de país em cada perfil do X, a partir dos dados do próprio X. Avisos de VPN, e oculte ou destaque publicações por país, organização, idade da conta ou palavra-chave da bio. Grátis para Chrome.',
      faq: [
        {
          q: 'Como vejo de que país é uma conta do X?',
          a: 'O X guarda um país para cada conta e mostra em "Sobre esta conta", mas um perfil por vez e só se você abrir o menu. Esta extensão lê esse mesmo campo e coloca a bandeira direto no cartão e na timeline — você vê sem clicar em nada.',
        },
        {
          q: 'Dá para saber se uma conta do X usa VPN?',
          a: 'O X marca algumas contas com localização que ele não consegue verificar. A extensão mostra isso como um selo ⚠ VPN ao lado da bandeira. Significa que o próprio X está em dúvida sobre o país, não que uma VPN esteja comprovada.',
        },
        {
          q: 'Dá para esconder ou recolher tweets de certos países?',
          a: 'Dá. Escolha os países ou regiões na página de opções e decida se os tweets correspondentes recolhem atrás de um botão "Mostrar" ou somem de vez. Recolher é o padrão — nada é removido da sua timeline em silêncio.',
        },
        {
          q: 'Dá para filtrar por outra coisa além de país?',
          a: 'Dá. Você pode bloquear toda conta que o X marca como pertencente a uma organização, marcar contas mais novas do que o limite que você definir, e destacar contas cujo nome ou bio bata com suas palavras-chave — ou cuja bio seja praticamente só emoji de bandeira. As regras de idade e palavra-chave só marcam a publicação, nunca a removem. Uma lista de permissão e exceções por regra cobrem as contas que você quer poupar.',
        },
        {
          q: 'Precisa da minha senha do X ou de chave de API?',
          a: 'De jeito nenhum. Ela usa a sessão do X que você já tem no navegador para fazer a mesma requisição que o site faz ao mostrar um perfil. Não tem login, não tem chave de API e não tem conta nossa.',
        },
        {
          q: 'A localização é precisa?',
          a: 'É exatamente tão precisa quanto os dados do próprio X, porque são os dados do próprio X. A extensão não adivinha por IP nem consulta base de dados externa. Onde o X sinaliza uma localização como não verificada, a extensão faz o mesmo.',
        },
      ],
    },

    aboutThisAccount: {
      title: 'X "Sobre esta conta": como ver e como ver mais rápido',
      description:
        'O X mostra o país de cada conta em "Sobre esta conta" — um perfil por vez, atrás de um menu. Veja onde encontrar e como obter direto na timeline.',
      faq: [
        {
          q: 'O que é "Sobre esta conta" no X?',
          a: 'Um painel que o X adicionou mostrando onde uma conta está baseada, quando ela entrou, quantas vezes trocou de @ e por qual loja de aplicativos se cadastrou. É o mesmo campo de país que esta extensão lê.',
        },
        {
          q: 'Onde fica "Sobre esta conta"?',
          a: 'Abra um perfil, toque no menu ⋯ no canto superior direito do cabeçalho e escolha "Sobre esta conta". Na web fica no mesmo menu ao lado do botão Seguir.',
        },
        {
          q: 'Por que não vejo "Sobre esta conta" em alguns usuários?',
          a: 'O X não devolve país para toda conta — as mais antigas ou menos ativas costumam não ter nada registrado. Quando o campo está realmente vazio, nenhuma ferramenta consegue preencher, incluindo esta.',
        },
        {
          q: 'Como vejo o país sem abrir cada perfil?',
          a: 'É exatamente a lacuna que esta extensão fecha. Ela lê o mesmo campo e desenha como bandeira no cartão e, se você quiser, direto na timeline — então varrer uma thread de oitenta respostas não significa oitenta visitas a um menu.',
        },
      ],
    },

    engagementFarming: {
      title: 'Como identificar engagement farming e spam de respostas no X',
      description:
        'Os sinais que separam uma resposta genuína de uma cultivada no X: idade da conta, proporção de seguidores, padrões de publicação e onde a conta realmente está.',
      faq: [
        {
          q: 'O que é engagement farming no X?',
          a: 'Publicar respostas pensadas para colher impressões em vez de dizer alguma coisa — concordância genérica, indignação reciclada, ou uma frase pronta colada embaixo do que estiver em alta. Desde que o X começou a pagar por impressões, existe um motivo financeiro direto.',
        },
        {
          q: 'Como saber se uma resposta no X é de bot ou de fazenda?',
          a: 'Nenhum sinal isolado é conclusivo. Os úteis se empilham: uma conta seguindo milhares enquanto dezenas a seguem, criada há semanas, respondendo em segundos a contas grandes, com a bio cheia de bandeiras e emojis. Um sozinho é normal; três juntos raramente são.',
        },
        {
          q: 'Que proporção seguidores/seguindo sugere uma conta cultivada?',
          a: 'Seguir muito mais contas do que te seguem — uma proporção bem abaixo de 0,1 — é o padrão clássico, porque seguir em massa é o jeito mais barato de ser notado. Dito isso, montes de contas novas comuns têm a mesma cara, então trate como um indício entre outros, não como veredito.',
        },
        {
          q: 'A extensão detecta engagement farming?',
          a: 'Não diretamente. O que ela faz é mostrar o país e o status de VPN da conta ali mesmo, que é o único sinal que você não tem como ver sem abrir cada perfil. Os outros sinais desta página continuam sendo um julgamento seu.',
        },
      ],
    },

    rateLimit: {
      title: 'O limite do X: 50 consultas de perfil a cada 15 minutos',
      description:
        'O X permite a um navegador cerca de 50 consultas de conta a cada 15 minutos. Como o X-Pat raciona essa janela e por que a maioria dos perfis não gasta nenhuma.',
      faq: [],
    },

    comparison: {
      title: 'Alternativa ao X-Posed: X-Pat comparado, recurso por recurso',
      description:
        'Uma comparação honesta do X-Pat com o X-Posed e as outras duas extensões de localização do X mais instaladas — incluindo as três coisas que o X-Posed faz melhor.',
      faq: [
        {
          q: 'Qual é a melhor alternativa ao X-Posed?',
          a: 'Depende do que você precisa. O X-Posed é a opção mais consolidada e tem filtro por idioma, versões para Firefox e um app para iPhone que o X-Pat não tem. O X-Pat se diferencia no cache compartilhado: o servidor dele é publicado e você mesmo pode hospedar, as entradas em cache são conferidas entre instalações antes de serem servidas, e as consultas não carregam identificador que o servidor pudesse usar para montar um perfil do que você olhou.',
        },
        {
          q: 'O X-Pat é código aberto?',
          a: 'É, com licença MIT, e o servidor de cache com que ele conversa também — os dois moram no mesmo repositório, com documentação de deploy para Cloudflare Workers e para um VPS comum. O X-Posed também publica a extensão sob MIT; o que ele não publica é o Worker que recebe as contribuições do cache comunitário.',
        },
        {
          q: 'Essas extensões precisam da minha senha do X?',
          a: 'Nenhuma das comparadas aqui precisa. Elas usam a sessão do X já aberta no seu navegador para fazer a mesma requisição que o X faz ao mostrar um perfil. Não tem login, chave de API nem conta de terceiros.',
        },
        {
          q: 'Por que a bandeira para de aparecer no meio de uma thread?',
          a: 'O X permite a um navegador cerca de cinquenta consultas de conta a cada quinze minutos, e uma thread movimentada tem mais contas que isso. Extensões que batem no teto simplesmente param de preencher bandeiras. O cache compartilhado é o que evita isso — a maioria dos perfis não custa consulta porque outra pessoa já resolveu — e o X-Pat ainda reserva os últimos vinte por cento da janela para as contas em que você mesmo passa o mouse.',
        },
      ],
    },
  },
}
