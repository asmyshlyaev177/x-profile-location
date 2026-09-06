import type { Dict } from './en'

/** Spanish. Neutral, leaning peninsular; "tú" throughout, never "usted". */
export const es: Dict = {
  nav: {
    sections: 'Secciones',
    screenshots: 'Capturas',
    howItWorks: 'Cómo funciona',
    features: 'Funciones',
    privacy: 'Privacidad',
    comparison: 'Comparativa',
    sourceOnGitHub: 'Código en GitHub',
    home: 'X-Pat — inicio',
  },

  language: {
    label: 'Idioma',
    choose: 'Elige un idioma',
  },

  install: {
    chrome: 'Añadir a Chrome',
    edge: 'Añadir a Edge',
    brave: 'Añadir a Brave',
  },

  hero: {
    titleLead: 'Mira de dónde publica',
    titleAccent: 'de verdad una cuenta',
    lead: 'X ya sabe desde qué país publica cada cuenta. Lo que pasa es que no te lo enseña. Esto mete la bandera en la tarjeta emergente y te deja plegar u ocultar los países que prefieras saltarte.',
    seeItRunning: 'Verlo en marcha',
    railWorksIn: 'Funciona en',
    railAndroid: 'En Android',
    railAccount: 'Cuenta / clave API',
    railAccountValue: 'Ninguna',
    railVersion: 'Versión',
    panelFollowing: 'Siguiendo',
    panelFollowers: 'Seguidores',
    panelHidden: '🚫 Oculto · 🇮🇳 India',
    panelShow: 'Mostrar',
  },

  screenshots: {
    heading: 'Así se ve, funcionando dentro de X.',
    lead: 'Capturas de un timeline cualquiera. Elige una y míralo en acción.',
    fullSize: 'Tamaño completo',
    viewer: 'Visor de capturas',
    close: 'Cerrar',
    prev: 'Captura anterior',
    next: 'Captura siguiente',
    railLabel: 'Capturas',
    shots: {
      copy: {
        label: 'Copiar como imagen',
        alt: 'Una tarjeta al pasar el cursor con botones «Post» y «Acerca de» junto a la bandera, y al lado la página «Acerca de esta cuenta» copiada como imagen',
      },
      hover: {
        label: 'Bandera al pasar el ratón',
        alt: 'Una tarjeta emergente de X con una bandera alemana y la palabra Alemania bajo el @',
      },
      vpn: {
        label: 'Aviso de VPN',
        alt: 'Una tarjeta emergente con bandera de EE. UU. junto a una insignia roja ⚠ VPN',
      },
      feed: {
        label: 'Banderas en el feed',
        alt: 'Un timeline donde cada autor lleva su bandera integrada, sin necesidad de pasar el ratón',
      },
      blocked: {
        label: 'Oculto en el feed',
        alt: 'Una cronología con una publicación plegada tras una barra «🚫 Oculto · Egipto» y un botón Mostrar',
      },
      keyword: {
        label: 'Resaltado por palabra',
        alt: 'Un tuit resaltado en ámbar porque la bio del autor coincidió con una palabra guardada',
      },
      flagBios: {
        label: 'Bios cargadas de banderas',
        alt: 'Una cuenta marcada por acumular demasiadas banderas de países en su bio',
      },
      swipe: {
        label: 'Deslizar en el móvil',
        alt: 'Un timeline en ancho de móvil donde al deslizar a la derecha aparece el país del autor como superposición',
      },
    },
  },

  howItWorks: {
    heading: 'De dónde sale la bandera, de verdad',
    lead: 'Cada cuenta de X tiene un país asignado. X lo guarda detrás de un menú que casi nadie abre. Esto no adivina por IP ni consulta ninguna base de datos externa.',
    steps: {
      hover: {
        title: 'Pasas el ratón por encima de un perfil',
        body: 'O deslizas un tuit a la derecha, si estás en el móvil. No hay que abrir ninguna página de ajustes; la consulta ocurre justo donde ya tienes el cursor.',
        readoutKey: 'Disparador',
        readoutValue: 'hover · deslizar · feed',
      },
      ask: {
        title: 'Tu navegador le pregunta directamente a X',
        body: 'Aprovecha la sesión que ya tienes abierta para hacer exactamente la misma petición que hace la web al mostrar una cuenta. No metemos nada por medio.',
        readoutKey: 'Endpoint',
        readoutValue: 'x.com · AboutAccountQuery',
      },
      land: {
        title: 'La bandera aparece en la tarjeta',
        body: 'Tu navegador guarda la respuesta durante 30 días. La segunda consulta sale gratis. Y en la página de opciones hay un botón para borrarlo todo.',
        readoutKey: 'Caché',
        readoutValue: 'local · 30 días',
      },
    },
  },

  rateBudget: {
    link: 'Cómo funciona el presupuesto',
    heading: 'El límite de X, resuelto en lugar de estamparte contra él.',
    lead: 'Ya lo has visto fallar. Empieza a cargar la parte de arriba del hilo y de repente se para. Ese es el límite: cincuenta consultas por cada quince minutos. Un hilo medio movido tiene más cuentas que eso.',
    body: 'Aquí la mayoría de los perfiles no gasta ni una. Ya están en caché, o alguien los consultó antes y responde la caché compartida. El resto va racionado.',
    closing:
      'Si aun así consigues agotarla, te sale una cuenta atrás hasta el reseteo, no una bandera en blanco. El reparto y el ritmo los ajustas tú.',
    facts: {
      real: {
        title: 'El número real',
        body: 'El límite sale de las cabeceras de respuesta del propio X, no de un número inventado al compilar. Tus propios hovers también descuentan.',
        readoutKey: 'Origen',
        readoutValue: 'x-rate-limit-*',
      },
      spread: {
        title: 'Dosificado, no a toda pastilla',
        body: 'Más o menos una consulta cada 21 segundos, recalculada sobre la marcha: se estira cuando pasas mucho el ratón y se encoge cuando la ventana se va recargando.',
        readoutKey: 'Ritmo',
        readoutValue: 'ventana ÷ presupuesto',
      },
      hovers: {
        title: 'El hover siempre tiene prioridad',
        body: 'El trabajo en segundo plano se corta al 85%, así que el resto de la ventana se reserva para las cuentas sobre las que tú pasas el ratón.',
        readoutKey: 'Reservado',
        readoutValue: '8 de 50',
      },
    },
    bar: {
      caption: 'Una ventana de 15 minutos',
      alt: 'Cincuenta consultas por ventana: cuarenta y dos para precarga en segundo plano, ocho reservadas para las cuentas sobre las que pasas el ratón.',
      backgroundNote:
        'en segundo plano, repartidas a lo largo de los quince minutos',
      reservedNote:
        'retenidas, para que pasar el ratón nunca sea justo la consulta que te deja sin nada',
    },
  },

  features: {
    heading: 'Un dato, y lo que haces con él.',
    lead: 'Funciona en tarjetas emergentes, páginas de perfil, tuits sueltos y en el feed. No hay que configurar nada antes.',
    readings: {
      country: {
        name: 'País',
        body: 'El país desde el que publica la cuenta. Aparece en la tarjeta emergente, y en el feed si lo activas.',
      },
      region: {
        name: 'Región',
        body: 'A veces X da una región en vez de un país. Recibes el código corto: NAM, EUR, SAS.',
      },
      vpn: {
        name: 'VPN',
        body: 'X puede marcar una ubicación como dudosa. El país sigue viéndose; simplemente sabes que debes tomártelo con cautela.',
      },
      registration: {
        name: 'Registro',
        body: 'La tienda de apps desde la que se creó la cuenta. Suele ser la más fiable de las dos señales.',
      },
      cooldown: {
        name: 'Enfriamiento',
        body: 'X limita las consultas que puedes hacer en 15 minutos. Si llegas al tope, una cuenta atrás te dice cuándo se reactiva, en lugar de dejarte preguntándote por qué no salió la bandera.',
      },
    },
    hide: {
      title: 'Oculta los países que prefieras saltarte.',
      p1: 'Una vez que ves de dónde viene una publicación, puedes actuar. Elige los países que quieras esquivar y decide qué pasa con sus tuits.',
      p2: 'Plegar es la opción por defecto. El tuit se encoge en una barra fina que pone <b>🚫 Oculto · 🇮🇳 India</b> con un botón Mostrar. Así sabes que algo había, y con un clic lo recuperas definitivamente. El filtro sigue el país de la tienda de apps si lo hay, y nunca toca el tuit que has abierto tú a propósito.',
      p3: 'El país no es el único filtro que tienes. Bloquea una organización y se van todas las cuentas que X etiquete como suyas. Y las cuentas más nuevas de lo que marques aparecen señaladas — solo señaladas, nunca ocultas, porque ser nueva no demuestra nada.',
      readoutCollapse: 'Plegar',
      readoutCollapseValue: 'Barra fina + Mostrar',
      readoutHide: 'Ocultar',
      readoutHideValue: 'Eliminado sin más',
      readoutOff: 'Desactivado',
      readoutOffValue: 'Solo banderas',
      previewRemoved: 'tuit retirado',
    },
    highlight: {
      title: 'Marca las cuentas que quieras pillar al vuelo.',
      p1: 'Guarda unas palabras clave y cualquier tuit cuyo autor coincida se marca con un borde ámbar, con las palabras que han encajado junto al @. Lo mismo para las bios cargadas de banderas: saltan a partir del número que tú decidas.',
      p2: 'Las reglas se gestionan en la página de opciones de la extensión, junto con las excepciones: una lista blanca de cuentas que ninguna regla toca, y exenciones por regla para salvar una cuenta de la palabra clave pero no del filtro por país.',
      readoutMatch: 'Coincidencia en',
      readoutMatchValue: 'Nombre · bio',
      readoutFlags: 'N.º de banderas',
      readoutFlagsValue: 'Tu umbral',
      readoutExceptions: 'Excepciones',
      readoutExceptionsValue: 'Por cuenta',
      optionsTitle: 'Opciones',
      optionsSaved: 'guardado',
      optionsByKeyword: 'Resaltar por palabra clave 🔍',
      optionsByFlags: 'Resaltar por banderas 🏴',
      optionsPlaceholder: 'Escribe una palabra clave…',
    },
    cache: {
      title: 'Una caché que llenamos entre todos',
      p1: 'Las banderas que consultas tú y las que consultan otros van al mismo sitio. Así la mayoría de perfiles se resuelven al instante sin gastar consulta. Lo único que sale de aquí es el @ público y su bandera. Tu cuenta, tus cookies, las bios y tu historial se quedan donde están.',
      p2: 'Un interruptor la apaga del todo. Y al apagarla se detienen también las consultas en segundo plano. A partir de ahí la extensión solo habla con X, y únicamente cuando tú se lo pides.',
      contributors: 'colaboradores',
      shared: 'compartida',
      instant: '⚡ al instante',
    },
    swipe: {
      title: 'Y en el móvil, con un gesto',
      p1: 'Desliza cualquier tuit a la derecha para recuperar la ubicación del autor. Se activa a mitad del gesto, sin esperar a que levantes el dedo, y una superposición te muestra el país.',
      p2: 'En Android necesitas un navegador que ejecute extensiones de escritorio. <b>{browser}</b> es con el que se ha probado esto.',
    },
  },

  trust: {
    heading: 'Una extensión que lee tu sesión de X más vale que vaya al grano.',
    lead: 'Así que allá va. Las consultas van directamente a x.com, igual que las peticiones propias del sitio, y nunca pasan por un servidor nuestro. Tu navegador conserva los resultados 30 días y la página de opciones los borra cuando quieras.',
    body: 'Dentro de la extensión no hay analíticas ni telemetría. Esta web sí usa Google Analytics, para contar visitas y saber qué botón de instalación se pulsó. Nada más.',
    readPolicy: 'Leer la política de privacidad completa',
    neverTitle: 'Nunca se envía a ningún sitio',
    neverNote: 'No hay ajuste que tocar. La extensión nunca lo lee.',
    never: [
      'Tu cuenta de X, cookies o tokens de sesión',
      'Bios, nombres públicos ni nada de lo que lees',
      'Tu historial de navegación o tu actividad en X',
      'Nada que te identifique personalmente',
    ],
    optTitle: 'Solo con la caché activada',
    optNote:
      'Un interruptor en la página de opciones lo controla todo. Lo apagas y no sale nada.',
    optional: [
      'El @ público que has consultado, p. ej. @jack',
      'Sus datos de bandera: ubicación, origen, indicador de VPN',
      'Un ID de instalación aleatorio, para que la misma bandera enviada por distintas personas cuente una sola vez',
    ],
  },

  compareTeaser: {
    heading: '¿Ya usas alguna de las otras?',
    lead: 'Hay unas veinte extensiones que ponen una bandera al lado de un @. Las diferencias que importan no están en la lista de funciones: están en lo que la caché compartida tiene permiso para hacer, y en qué pasa cuando se agotan las cincuenta consultas de X.',
    body: 'Esta se marca el ritmo con el presupuesto real que viene en las cabeceras de respuesta de X y reserva ocho consultas para las cuentas sobre las que pasas el ratón, así que un hilo cargado termina de rellenarse en vez de pararse a medias. La tabla completa tiene catorce filas y señala las tres cosas que X-Posed hace mejor que esta extensión.',
    link: 'Ver la comparativa completa →',
  },

  cta: {
    heading: 'Deja de adivinar de dónde viene el timeline.',
    body: 'Gratis, y funciona desde el momento en que la instalas. No hay que crear ninguna cuenta.',
  },

  faq: {
    heading: 'Lo que la gente pregunta de verdad',
  },

  footer: {
    tagline:
      'Una bandera de país en cada perfil de X, sacada de los datos del propio X. Hecho por una sola persona, sin empresa detrás.',
    version: 'Versión',
    notAffiliated:
      'Sin relación con X Corp. Los datos de ubicación vienen de los endpoints públicos del propio X.',
    groupExtension: 'La extensión',
    groupGuides: 'Guías',
    groupSmallPrint: 'Letra pequeña',
    chromeWebStore: 'Chrome Web Store',
    supportProject: 'Apoyar el proyecto',
    guideAboutAccount: '«Información de esta cuenta» en X',
    guideEngagementFarming: 'Detectar el engagement farming',
    guideRateLimit: 'El límite de X',
    guideComparison: 'Comparativa con X-Posed',
    privacyPolicy: 'Política de privacidad',
    whatIsNotCollected: 'Lo que no se recopila',
    contact: 'Contacto',
  },

  table: {
    caption:
      'X-Pat frente a las tres extensiones de ubicación para X más instaladas',
    feature: 'Función',
    yes: 'sí',
    no: 'no',
    notStated: 'no consta',
    notApplicable: 'no aplicable',
  },

  comparison: {
    rows: {
      inlineCountry: {
        label: 'País visible sin abrir ningún menú',
        note: 'Leído de los datos de «Información de esta cuenta» del propio X, no adivinado a partir de una IP.',
      },
      signupSource: {
        label: 'Origen del registro: Apple, Google Play o web',
        note: '',
      },
      accountAge: { label: 'Antigüedad de la cuenta', note: '' },
      handleChanges: {
        label: 'Número de cambios de @',
        note: '',
      },
      hideByCountry: {
        label: 'Ocultar o plegar por país y región',
        note: 'Plegar tras un botón «Mostrar» es la opción por defecto, porque un timeline que descarta publicaciones sin avisar es un timeline que no puedes auditar.',
      },
      allowlist: {
        label: 'Lista blanca y excepciones por regla',
        note: '',
      },
      budgetFromHeaders: {
        label:
          'Se marca el ritmo con el presupuesto real de las cabeceras de X',
        note: 'X-Pat lee las cabeceras x-rate-limit en cada respuesta y reparte sus consultas por lo que queda de ventana, reservando una parte para las cuentas sobre las que pasas el ratón. X-Posed va a un intervalo fijo de 150 ms con ocho peticiones en paralelo y lee la cabecera de reinicio solo después de recibir un 429.',
      },
      sharedCache: {
        label: 'Caché compartida, para que las banderas sobrevivan al límite',
        note: 'X permite a un navegador unas 50 consultas de perfil cada 15 minutos. Sin caché compartida, ese techo define toda la experiencia.',
      },
      cacheServerSource: {
        label: 'Código del servidor de caché publicado',
        note: 'El servidor que recibe las contribuciones, no solo la extensión que las envía. El nuestro está en el mismo repositorio, con documentación de despliegue: puedes leerlo o montarte el tuyo.',
      },
      crossChecked: {
        label: 'Entradas de caché contrastadas entre instalaciones',
        note: 'Aquí se guardan votos por instalación y se sirve el consenso, con un umbral de confianza que puedes subir. X-Posed documenta que guarda el último valor aceptado para un @.',
      },
      extensionSource: {
        label: 'Código de la extensión publicado',
        note: '',
      },
      testSuite: {
        label: 'Suite de tests automatizados en el repositorio',
        note: 'Unitarios, end-to-end contra tráfico grabado y regresión visual. La cifra es lo que ejecuta el CI en cada push.',
      },
      firefox: { label: 'Firefox', note: '' },
      iosApp: { label: 'App complementaria para iPhone / iPad', note: '' },
    },
    losses: {
      mature: {
        title: 'X-Posed es la veterana',
        body: 'Unas 10.000 instalaciones en Chrome frente a las cuatro nuestras, cuatro meses de ventaja y una caché comunitaria con millones de perfiles donde la nuestra tiene miles. Una caché más grande significa, literalmente, más banderas al instante desde el primer día. Esa ventaja es real y ni se acerca.',
      },
      surfaces: {
        title: 'Está en más plataformas',
        body: 'Firefox de escritorio, Firefox para Android y una app complementaria para iPhone. X-Pat hoy solo va en Chromium: Chrome, Edge, Brave y Quetta en Android. Firefox está en los planes, iOS no.',
      },
      languageFilter: {
        title: 'Tiene filtro por idioma',
        body: 'Nosotros no, y es adrede. El campo de idioma por tuit de X mete suficientes fallos como para que filtrar por él haga desaparecer publicaciones sin motivo aparente. Es una decisión defendible, no una carencia — pero si lo que buscas es filtrar por idioma, X-Posed lo tiene y nosotros no.',
      },
    },
    notApplicable: 'n/d',
    testCount: '{count} tests',
    none: 'ninguno',
  },

  guides: {
    aboutThisAccount: {
      kicker: 'Guía',
      titleLead: 'El panel de',
      titleAccent: '«Información de esta cuenta»',
      titleRest: ' en X, y cómo dejar de hacer tres clics para llegar a él.',
      lead: 'X sabe de sobra desde qué país publica cada cuenta, y te lo cuenta si quieres — perfil a perfil, a tres toques de profundidad, los que te dé la paciencia. Aquí te digo dónde está ese panel, qué puede y qué no puede responder, y qué hacer cuando necesitas el mismo dato para ochenta respuestas en lugar de una.',
      whereHeading: 'Dónde está el panel realmente',
      steps: {
        web: {
          where: 'Web',
          body: 'Abre el perfil y ve al menú ⋯ que está junto al botón Seguir. «Información de esta cuenta» aparece en esa lista.',
        },
        mobile: {
          where: 'iOS / Android',
          body: 'Abre el perfil y toca los ⋯ en la esquina superior derecha de la cabecera. Misma opción, mismo panel.',
        },
        what: {
          where: 'Lo que obtienes',
          body: 'El país donde está basada la cuenta, más o menos cuándo se creó, cuántas veces ha cambiado de @ y desde qué tienda de apps se registró.',
        },
      },
      cantHeading: 'Lo que no puede responder',
      cant1:
        'El panel es por perfil y modal. Fenomenal si estás revisando una sola cuenta, un desastre cuando estás leyendo un hilo de respuestas, que es justo cuando surge la duda. Cien respuestas son cien viajes de ida y vuelta por un menú, y para la tercera ya has perdido el hilo que estabas leyendo.',
      cant2:
        'Y no siempre tiene datos. X no devuelve país para un montón de cuentas — sobre todo las más antiguas o las que apenas se mueven. Cuando el campo está realmente vacío no hay nada que revelar, y cualquier herramienta que diga lo contrario está inventándoselo a partir de una IP.',
      cant3:
        'Y no dice nada sobre la fiabilidad. X marca internamente algunas ubicaciones como no verificadas, pero el panel te enseña el país igual.',
      sameHeading: 'El mismo campo, sin el menú',
      same1:
        'X-Pat lee exactamente el campo que lee el panel — el mismo endpoint, usando la sesión de X que ya tienes abierta — y lo pinta como una bandera en la tarjeta emergente y, si quieres, integrada en el timeline. Sin consultas de IP, sin bases de datos de terceros, sin cuenta ni clave API.',
      same2:
        'De esa respuesta extrae tres cosas: el país, la tienda de apps desde la que se registró la cuenta, y si X marca la ubicación como dudosa — la señal de confianza que el panel omite. La fecha de registro y el historial de @ se quedan como están; la extensión no pretende sustituir al panel entero.',
      same3:
        'Y puedes actuar a partir de ahí: los países y regiones que prefieras saltarte pueden plegarse tras un botón «Mostrar», u ocultarse del todo. Plegar es la opción por defecto, porque un timeline que borra publicaciones en silencio es un timeline en el que no puedes confiar.',
    },

    engagementFarming: {
      kicker: 'Guía',
      titleLead: 'Cómo detectar el',
      titleAccent: 'engagement farming',
      titleRest: ' en X.',
      lead: 'Desde que X paga por impresiones, responder se ha vuelto un oficio. Mal pagado, que es justo por lo que el resultado tiene la pinta que tiene: rápido, genérico y pegado debajo de lo que sea tendencia. Estas son las señales que de verdad distinguen una respuesta real de una cultivada.',
      noVerdictHeading: 'Ninguna señal por sí sola es concluyente',
      noVerdict1:
        'Cada pista de las de abajo tiene una explicación inocente. Las cuentas nuevas son eso, nuevas. Hay quien sigue a mucha gente sin más. Un montón de gente que escribe con cabeza tiene un emoji en la bio. Tomar cualquiera de estas señales como prueba te llevará a descartar a completos desconocidos sin motivo, y eso es desagradable y además aburrido.',
      noVerdict2:
        'Lo que funciona es juntarlas. Una cuenta de tres semanas que sigue a miles, seguida por decenas, la primera en responder con una frase de catálogo: esa combinación no es casualidad, y la lees en un par de segundos en cuanto sabes dónde mirar.',
      colSignal: 'Señal',
      colTell: 'Qué aspecto tiene',
      colCost: 'Coste de comprobarlo',
      signals: {
        ratio: {
          signal: 'Ratio seguidores / seguidos',
          tell: 'Sigue a 4.000, la siguen 40',
          cost: 'Un vistazo a la tarjeta emergente',
        },
        age: {
          signal: 'Antigüedad de la cuenta',
          tell: 'Creada hace tres semanas y ya metida hasta el fondo en hilos políticos',
          cost: 'Tarjeta emergente',
        },
        latency: {
          signal: 'Latencia de respuesta',
          tell: 'Primera respuesta en segundos, desde una cuenta sin ningún historial con el autor',
          cost: 'La marca de tiempo, si te paras a mirar',
        },
        bio: {
          signal: 'Composición de la bio',
          tell: 'Una hilera de banderas y emojis donde podría ir una frase',
          cost: 'Gratis — salta a la vista',
        },
        substance: {
          signal: 'Contenido de la respuesta',
          tell: 'La misma frase de catálogo que has visto hoy bajo otras cuatro publicaciones',
          cost: 'Memoria, más que nada',
        },
        location: {
          signal: 'De dónde publica la cuenta',
          tell: 'Dando lecciones sobre un país desde el que la cuenta jamás ha publicado',
          cost: 'Tres toques por perfil — o integrado',
        },
      },
      hiddenHeading: 'La que no puedes ver',
      hidden1:
        'Cinco de estas seis señales ya están a la vista. Conteo de seguidores, fecha de registro, la bio, la propia respuesta: X te lo da todo sin que se lo pidas. La sexta es la que X esconde tras un menú: el país desde el que publica realmente la cuenta.',
      hidden2:
        'Esta importa más que las otras para un tipo concreto de fastidio — no exactamente spam, sino sentar cátedra sobre un sitio en el que la cuenta no se juega nada. Eso se lee muy distinto cuando puedes verlo, y X te obliga a abrir un panel por perfil para averiguarlo.',
      hidden3:
        '<b>X-Pat se encarga de esa parte.</b> Pone el país en la tarjeta emergente y, si quieres, integrado en el timeline — más un aviso cuando ni el propio X puede verificar la ubicación. No puntúa cuentas ni juzga respuestas por ti; las otras cinco señales las valoras tú. Solo evita que el único dato que X esconde de verdad te cueste tres toques.',
    },

    comparison: {
      kicker: 'Comparativa',
      titleLead: 'X-Pat frente a',
      titleAccent: 'X-Posed',
      titleRest: ', y al resto del escaparate.',
      lead: 'Hay unas veinte extensiones que ponen una bandera de país junto a un @ de X. Tres de ellas tienen una base de usuarios que merece la pena mirar. Esto es lo que hace cada una de verdad, en qué se diferencia X-Pat, y las tres cosas que X-Posed hace mejor — que es la parte que la mayoría de comparativas se calla.',
      featureHeading: 'Función por función',
      featureLead:
        'Cada celda viene de la ficha pública de la tienda o del repositorio público, consultados el {date}. Un guion significa que la ficha no lo dice: para las dos extensiones de código cerrado eso no equivale a un no, y sería injusto pintarlo como tal.',
      aheadHeading: 'Dónde X-Posed lleva ventaja',
      differsHeading: 'Lo que realmente cambia',
      differs1:
        'Todo lo de esta categoría depende de una caché compartida. X permite a un navegador unas cincuenta consultas de perfil cada quince minutos, y un hilo movido tiene más cuentas que eso — así que cualquier extensión de esta lista que siga funcionando pasado el límite lo hace leyendo una caché que han llenado otros. La pregunta no es si hay un servidor. Es qué tiene permiso para hacer.',
      differs2:
        '<b>El nuestro está publicado, y puedes montarte el tuyo.</b> El servidor de caché está en el mismo repositorio que la extensión, con documentación de despliegue tanto para Cloudflare Workers como para un VPS normal. X-Posed publica su extensión — de verdad, bajo licencia MIT — pero no publica el Worker al que se envían las contribuciones. Esa es justo la pieza que no puedes comprobar leyendo el código que instalaste.',
      differs3:
        '<b>Aquí una respuesta cacheada necesita corroboración.</b> Las contribuciones se guardan como votos por instalación y se sirve el consenso, con un umbral de confianza que puedes subir desde las opciones. La documentación de X-Posed describe que guarda el último valor aceptado para un @, es decir, decide el último que ha contribuido. Ambos diseños reconocen el mismo problema de fondo: ningún servidor puede demostrar que una contribución venga realmente de X.',
      differs4:
        '<b>Las consultas no llevan identificador.</b> Las lecturas son una lista sin firmar de @, así que el servidor no tiene con qué cruzarlas y no puede construir «esta instalación ha mirado estas cuentas». Contar lectores sería una línea de código y acabaría con esa propiedad; por eso las estadísticas públicas subestiman a propósito.',
      differs5:
        'Y el límite se raciona en lugar de echar una carrera: el trabajo en segundo plano se corta al ochenta y cinco por ciento de la ventana, así que las últimas ocho consultas se quedan para las cuentas sobre las que tú pasas el ratón. <a href="{href}">El mecanismo está detallado en la página principal</a>.',
      sourcesHeading: 'Fuentes',
      sourcesLead:
        'Consultado el {date}. Las cifras de instalaciones y las funciones cambian con el tiempo; si algo de aquí abajo está desactualizado, es un error, no una postura, y el <a href="{href}">gestor de incidencias</a> es la vía más rápida para corregirlo.',
      sourceLabel: ' — código: ',
      sourceNotPublished: ' — código no publicado',
    },
  },

  pages: {
    home: {
      title:
        'X-Pat — Ubicación de perfiles en X: mira de qué país es cualquier cuenta',
      description:
        'Una bandera de país en cada perfil de X, con datos del propio X. Avisos de VPN, ocultar o resaltar publicaciones por país, organización, antigüedad o palabra clave. Gratis para Chrome.',
      faq: [
        {
          q: '¿Cómo veo de qué país es una cuenta de X?',
          a: 'X guarda un país para cada cuenta y lo expone en «Información de esta cuenta», pero solo perfil a perfil y siempre que abras el menú. La extensión lee ese mismo campo y pone la bandera directamente en la tarjeta emergente y en el timeline, así que lo ves sin hacer clic.',
        },
        {
          q: '¿Puedo saber si una cuenta de X usa una VPN?',
          a: 'X marca algunas cuentas con una ubicación que no puede verificar. La extensión lo muestra como una insignia ⚠ VPN junto a la bandera. Significa que el propio X no se fía del país, no que esté demostrado que hay una VPN.',
        },
        {
          q: '¿Puedo ocultar o plegar tuits de según qué países?',
          a: 'Sí. Elige los países o regiones en la página de opciones y decide si los tuits coincidentes se pliegan tras un botón «Mostrar» o desaparecen del todo. Plegar es la opción por defecto: nada se borra de tu timeline sin que te enteres.',
        },
        {
          q: '¿Puedo filtrar por algo que no sea el país?',
          a: 'Sí. Puedes bloquear todas las cuentas que X etiquete como pertenecientes a una organización, marcar las cuentas más nuevas de lo que tú decidas, y resaltar aquellas cuyo nombre o bio coincida con tus palabras clave, o cuya bio sea prácticamente puros emojis de bandera. Las reglas de antigüedad y de palabra clave solo marcan el tuit, nunca lo quitan. Una lista blanca y excepciones por regla protegen las cuentas que quieras mantener al margen.',
        },
        {
          q: '¿Necesita mi contraseña de X o una clave de API?',
          a: 'Ni una ni otra. Aprovecha la sesión de X que ya tienes abierta en el navegador para hacer la misma petición que hace la web al mostrar un perfil. No hay que iniciar sesión, no hay clave API y no hay cuenta nuestra.',
        },
        {
          q: '¿Es precisa la ubicación?',
          a: 'Tan precisa como los datos del propio X, porque son los datos del propio X. La extensión no adivina por IP ni consulta bases de datos externas. Donde X marca una ubicación como no verificada, la extensión hace lo mismo.',
        },
      ],
    },

    aboutThisAccount: {
      title:
        '«Información de esta cuenta» en X: cómo verlo y cómo verlo más rápido',
      description:
        'X muestra el país de cada cuenta en «Información de esta cuenta», perfil a perfil y detrás de un menú. Aquí te explico dónde está y cómo tenerlo integrado.',
      faq: [
        {
          q: '¿Qué es «Información de esta cuenta» en X?',
          a: 'Un panel que añadió X donde se ve dónde está basada una cuenta, cuándo se creó, cuántas veces ha cambiado de @ y desde qué tienda de apps se registró. Es el mismo campo de país que lee esta extensión.',
        },
        {
          q: '¿Dónde está «Información de esta cuenta»?',
          a: 'Abre un perfil, toca el menú ⋯ en la esquina superior derecha de la cabecera y elige «Información de esta cuenta». En la web está en ese mismo menú, junto al botón Seguir.',
        },
        {
          q: '¿Por qué no veo «Información de esta cuenta» para algunos usuarios?',
          a: 'X no devuelve país para todas las cuentas: las más antiguas o menos activas a menudo no tienen nada registrado. Si el campo está realmente vacío, ninguna herramienta puede rellenarlo, incluida esta.',
        },
        {
          q: '¿Cómo veo el país sin abrir cada perfil?',
          a: 'Ese es justo el hueco que cierra esta extensión. Lee el mismo campo y lo dibuja como bandera en la tarjeta emergente y, si quieres, integrado en el timeline — así que revisar un hilo de ochenta respuestas no implica ochenta visitas al menú.',
        },
      ],
    },

    engagementFarming: {
      title: 'Cómo detectar engagement farming y spam de respuestas en X',
      description:
        'Las señales que distinguen una respuesta real de una cultivada en X: antigüedad de la cuenta, ratio de seguidores, patrones de publicación y dónde está basada realmente la cuenta.',
      faq: [
        {
          q: '¿Qué es el engagement farming en X?',
          a: 'Publicar respuestas pensadas para acumular impresiones en lugar de decir algo: acuerdo genérico, indignación de usar y tirar, o una frase prefabricada pegada bajo el tuit que esté en tendencia. Desde que X paga por impresiones, hay un incentivo económico directo.',
        },
        {
          q: '¿Cómo sé si una respuesta en X es de un bot o de una granja?',
          a: 'Ninguna señal por sí sola es concluyente. Las útiles se acumulan: una cuenta que sigue a miles mientras la siguen decenas, creada hace semanas, que responde en segundos a cuentas grandes, con la bio llena de banderas y emojis. Una sola no dice nada; tres juntas rara vez son casualidad.',
        },
        {
          q: '¿Qué ratio seguidores/seguidos apunta a una cuenta cultivada?',
          a: 'Seguir a muchísimas más cuentas de las que te siguen — un ratio muy por debajo de 0,1 — es el patrón de manual, porque el follow masivo es la forma más barata de hacerse ver. Eso sí, montones de cuentas nuevas perfectamente normales tienen esa pinta, así que tómalo como un indicio más, no como sentencia.',
        },
        {
          q: '¿La extensión detecta el engagement farming?',
          a: 'No directamente. Lo que hace es mostrar el país y el estado de VPN de la cuenta integrados en el timeline, que es justo la única señal que no puedes ver sin abrir cada perfil. El resto de señales de esta página las valoras tú.',
        },
      ],
    },

    rateLimit: {
      title: 'El límite de X: 50 consultas de perfil cada 15 minutos',
      description:
        'X permite a un navegador unas 50 consultas de cuenta cada 15 minutos. Cómo X-Pat raciona esa ventana y por qué la mayoría de los perfiles no gastan ninguna.',
      faq: [],
    },

    comparison: {
      title: 'Alternativa a X-Posed: X-Pat comparado, función por función',
      description:
        'Una comparativa sincera de X-Pat frente a X-Posed y las otras dos extensiones de ubicación más instaladas, incluidas las tres cosas que X-Posed hace mejor.',
      faq: [
        {
          q: '¿Cuál es la mejor alternativa a X-Posed?',
          a: 'Depende de lo que necesites. X-Posed es la opción más consolidada y ofrece filtro por idioma, versiones para Firefox y una app para iPhone que X-Pat no tiene. X-Pat se diferencia en la caché compartida: su servidor está publicado y puedes alojarlo tú, las entradas cacheadas se contrastan entre instalaciones antes de servirse, y las consultas no llevan ningún identificador que el servidor pudiera usar para trazar un perfil de lo que has mirado.',
        },
        {
          q: '¿Es X-Pat de código abierto?',
          a: 'Sí, bajo licencia MIT, igual que el servidor de caché con el que se comunica: los dos están en el mismo repositorio, con documentación de despliegue para Cloudflare Workers y para un VPS normal. X-Posed también publica su extensión bajo MIT; lo que no publica es el Worker que recibe las contribuciones a la caché comunitaria.',
        },
        {
          q: '¿Necesitan mi contraseña de X estas extensiones?',
          a: 'Ninguna de las que comparamos aquí. Aprovechan la sesión de X que ya tienes abierta en el navegador para hacer la misma petición que hace X al mostrar un perfil. No hay que iniciar sesión, no hay clave API ni cuenta de terceros.',
        },
        {
          q: '¿Por qué deja de aparecer la bandera a mitad de un hilo?',
          a: 'X permite a un navegador unas cincuenta consultas de cuenta cada quince minutos, y un hilo movido tiene más cuentas que eso. Las extensiones que chocan con el límite simplemente dejan de rellenar banderas. La caché compartida es lo que lo evita — la mayoría de perfiles no cuesta consulta porque otro ya los resolvió — y X-Pat además reserva el último veinte por ciento de la ventana para las cuentas sobre las que tú pasas el ratón.',
        },
      ],
    },
  },
}
