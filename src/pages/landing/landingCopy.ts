const en = {
  hero: {
    tagline: 'From evidence comes excellence',
    getStarted: 'Get started',
    watchDemo: 'Watch demo',
    scrollLabel: 'Scroll to learn more',
  },
  mission: {
    eyebrow: 'Evidence-based teaching',
    heading: 'We’re putting institutional-grade analytics into the hands of everyday teachers',
    body: 'Designing a strategy to get a class from where they are, to where they need to be, demands a detailed understanding, not just of the curriculum, but also of every student’s background, ability and learner profile. Making the right calls in this environment is tough. And the stakes are high. Guidelight is the beacon that helps you navigate this voyage. Our AI-native platform turns every homework, assessment, and class activity into clear, actionable data on who is learning, who needs help, and where support is needed. With the right tools in hand, every teacher can lead their students to success.',
  },
  features: {
    eyebrow: 'The platform',
    heading: 'The instruments for the voyage',
    items: [
      {
        title: 'Homework',
        features:
          'AI-generated, curriculum-aligned tasks; teacher review before release; automatic marking with written feedback; every attempt stored against the student profile.',
        impact:
          'Save hours of preparation and marking, while every student attempt becomes data on their understanding.',
      },
      {
        title: 'Assessments',
        features:
          'Formative and summative papers in exam format; timed delivery; integrity controls; teacher-reviewed feedback before release.',
        impact:
          'Know exactly who is on track, who needs intervention, and how ready your class is for the real exam.',
      },
      {
        title: 'Insights',
        features:
          'Class and student trends; weakspot analysis; exam-readiness probabilities; event tracking; report generation; CSV export.',
        impact: 'Reason about your teaching impact with confidence — not assumptions.',
      },
      {
        title: 'Lesson planning',
        features:
          'AI-generated, personalised semester plans; scaffolded lesson detail; fully editable; exportable.',
        impact: 'Cut planning time and share polished plans with leaders or parents.',
      },
      {
        title: 'Data security',
        features:
          'All AI runs on Cloudflare’s edge — class data is never sent to OpenAI or any external AI provider. TLS everywhere, AES-256 at rest, GDPR export and deletion built in.',
        impact: 'Institutional-grade privacy without institutional procurement.',
      },
      {
        title: 'English level & reading speed',
        features:
          'Full CEFR A1–C2 diagnostic with listening comprehension, mapped to IELTS bands; RSVP reading-speed testing with comprehension spot-checks.',
        impact: 'Place every student at the right level in one sitting.',
      },
    ],
  },
  reviews: {
    eyebrow: 'Testimonials',
    heading: 'What teachers are saying',
    items: [
      {
        quote:
          "Three hours of my Sunday evening back. Every week. The AI marking is scarily precise.",
        author: 'Sarah K.',
        role: 'English HoD',
      },
      {
        quote:
          "It’s like Palantir, but for teachers — I can finally see exactly where every student is slipping.",
        author: 'David L.',
        role: 'Year 6 teacher',
      },
      {
        quote:
          "We stopped guessing about weak topics. Now we know, down to the CEFR descriptor, who needs what.",
        author: 'Priya M.',
        role: 'EAL coordinator',
      },
      {
        quote:
          "How did I plan a full term of lessons in twenty minutes? I didn’t — Guidelight did, and I just edited.",
        author: 'Tom B.',
        role: 'History teacher',
      },
      {
        quote:
          "My department head asked how I had such detailed readiness data. I just sent her the Guidelight report.",
        author: 'Jessica T.',
        role: 'Maths teacher',
      },
      {
        quote:
          "The mock-exam generator is weapons-grade. It’s like having a senior examiner on staff who never sleeps.",
        author: 'Ahmed R.',
        role: 'Exam Officer',
      },
      {
        quote:
          "Parents love the clear feedback reports, and my students actually read the comments now.",
        author: 'Emily W.',
        role: 'Primary teacher',
      },
      {
        quote: "First AI tool I’ve used that feels like a colleague, not a toy.",
        author: 'Mark D.',
        role: 'Science lead',
      },
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    heading: 'Only pay for the AI you burn',
    body: 'No per-seat licences. No subscription. Guidelight is unique in charging only for the AI tokens you actually use — so if you don’t use lots, you don’t pay lots. Fair by design.',
    points: [
      {
        title: 'Starter credit included',
        body: 'Start free — no card, no trial timer. New accounts include starter credit so you can try every AI feature today.',
      },
      {
        title: 'A cap you control',
        body: 'A default $20 monthly AI spending cap keeps costs predictable. Raise it or lower it anytime — costs never surprise you.',
      },
      {
        title: 'Month-end invoice',
        body: 'You pay only for the AI you actually used, invoiced at month end with school PO details so you can reclaim it.',
      },
    ],
    cta: 'Get started',
  },
  faq: {
    eyebrow: 'Questions',
    heading: 'Frequently asked',
    items: [
      {
        q: 'Where does my class data go?',
        a: 'Nowhere you wouldn’t want it to. Everything runs on Cloudflare’s edge network and all AI runs through Cloudflare Workers AI — your class data is never sent to OpenAI, ChatGPT, or any external AI provider. Student names are stored only as first name plus surname initial.',
      },
      {
        q: 'Do I need a card to get started?',
        a: 'No. New accounts include starter credit and a default $20 monthly AI spending cap, so you can plan lessons, set homework, and run assessments immediately. There’s no subscription — you pay at month end only for the AI you actually use, and you can raise or lower your cap anytime.',
      },
      {
        q: 'Which curricula and exam boards are supported?',
        a: 'Any of them. You paste your curriculum or syllabus notes when creating a class, and Guidelight aligns tasks, lesson plans, and mock exams to them. Essay tasks can be aligned to an uploaded exam-board rubric, with an AI model essay and a rewrite loop for students.',
      },
      {
        q: 'Does Guidelight work in mainland China?',
        a: 'Yes. The whole app — including every AI feature — runs on Cloudflare’s network on our own domain, and the browser never calls an external AI provider. It works with or without a VPN.',
      },
      {
        q: 'How does AI marking work?',
        a: 'AI marks each attempt with written feedback aligned to your rubric, and nothing reaches students until you’ve reviewed and released it. Every mark is stored against the student’s profile, feeding weakspot analysis and exam-readiness estimates.',
      },
      {
        q: 'What student data is stored, and can it be deleted?',
        a: 'The minimum needed to teach: a display name (first name + surname initial), optional interests and career ambitions, and their submitted work. Account export and deletion are built in, in line with GDPR.',
      },
    ],
  },
  signoff: {
    line: 'Guide your students to excellence with AI-native homework, assessment and data insights.',
    cta: 'Get started',
  },
}

export type LandingCopy = typeof en

const zh: LandingCopy = {
  hero: {
    tagline: '以实证，致卓越',
    getStarted: '开始使用',
    watchDemo: '观看演示',
    scrollLabel: '向下滚动了解更多',
  },
  mission: {
    eyebrow: '循证教学',
    heading: '把机构级的教学分析能力，交给每一位一线教师',
    body: '要让一个班级从现状抵达目标，需要的不只是对课程大纲的理解，更是对每一位学生的背景、能力与学习者画像的细致把握。在这样的环境中做出正确判断并不容易，而且事关重大。Guidelight 正是帮助您在这段航程中导航的灯塔。我们的 AI 原生平台，把每一次作业、测评和课堂活动，都转化为清晰、可操作的数据——谁掌握了，谁需要帮助，哪里需要支持。有了合适的工具，每位教师都能带领学生走向成功。',
  },
  features: {
    eyebrow: '平台功能',
    heading: '航程所需的全套工具',
    items: [
      {
        title: '作业',
        features:
          'AI 生成、贴合课程大纲的作业任务；发布前由教师审阅；自动批改并附书面反馈；每一次作答都计入学生档案。',
        impact: '节省数小时的备课与批改时间，同时让学生的每一次作答都成为其理解程度的数据。',
      },
      {
        title: '测评',
        features: '符合考试形式的过程性与总结性测评；限时作答；诚信管控；反馈经教师审阅后再发布。',
        impact: '精准掌握谁在正轨上、谁需要干预，以及全班面对正式考试的准备程度。',
      },
      {
        title: '洞察',
        features: '班级与学生趋势；薄弱点分析；考试就绪度概率；事件追踪；报告生成；CSV 导出。',
        impact: '以确凿的数据而非臆测，衡量您的教学成效。',
      },
      {
        title: '教案规划',
        features: 'AI 生成、因材施教的学期教案；结构化的课时细节；完全可编辑、可导出。',
        impact: '大幅压缩备课时间，并向校方或家长分享精美的教案。',
      },
      {
        title: '数据安全',
        features:
          '所有 AI 均运行在 Cloudflare 边缘网络——班级数据绝不会发送给 OpenAI 或任何外部 AI 服务商。全站 TLS 加密，静态数据 AES-256 加密，内置 GDPR 数据导出与删除。',
        impact: '无需繁琐的机构采购流程，即享机构级的隐私保护。',
      },
      {
        title: '英语水平与阅读速度',
        features:
          '完整的 CEFR A1–C2 水平诊断（含听力理解），对应雅思分数段；RSVP 阅读速度测试并配理解抽查。',
        impact: '一次测评，即可让每位学生定位到合适的水平。',
      },
    ],
  },
  reviews: {
    eyebrow: '用户评价',
    heading: '一线教师怎么说',
    items: [
      {
        quote: '每周日晚上能省出三个小时。AI 批改准得惊人。',
        author: '莎拉 K.',
        role: '英语学科组长',
      },
      {
        quote: '就像教育界的 Palantir——我终于能看清每个学生到底卡在哪里。',
        author: '大卫 L.',
        role: '六年级教师',
      },
      {
        quote: '我们不再凭感觉猜薄弱点。现在我们能精确到 CEFR 描述语，知道谁需要什么。',
        author: '普丽娅 M.',
        role: 'EAL 协调员',
      },
      {
        quote: '我怎么可能在二十分钟内排出一整个学期的课？不是我，是 Guidelight 排的，我只做了修改。',
        author: '汤姆 B.',
        role: '历史教师',
      },
      {
        quote: '学科组长问我怎么会有这么详细的备考数据。我就把 Guidelight 报告发给了她。',
        author: '杰西卡 T.',
        role: '数学教师',
      },
      {
        quote: '模拟考生成器简直是武器级水准。就像教研组里住着一位全年无休的高级考官。',
        author: '艾哈迈德 R.',
        role: '考务主任',
      },
      {
        quote: '家长喜欢清晰的反馈报告，学生也终于会认真看评语了。',
        author: '艾米莉 W.',
        role: '小学教师',
      },
      {
        quote: '这是我用过的第一个像同事、不像玩具的 AI 工具。',
        author: '马克 D.',
        role: '科学学科组长',
      },
    ],
  },
  pricing: {
    eyebrow: '定价',
    heading: '只为消耗的 AI 付费',
    body: '没有按席位收费，没有订阅制。Guidelight 的独特之处在于：只按您实际消耗的 AI 算力收费——用多少，付多少。公平，源于设计。',
    points: [
      {
        title: '含起步额度',
        body: '免费开始——无需绑卡，没有试用倒计时。新账户自带起步额度，今天即可体验全部 AI 功能。',
      },
      {
        title: '上限由您掌控',
        body: '默认每月 $20 的 AI 支出上限，让成本始终可预期。随时可调高或调低，绝不会有意外账单。',
      },
      {
        title: '月末结算账单',
        body: '只按当月实际使用的 AI 付费，月末开具账单，可附学校采购订单信息，方便报销。',
      },
    ],
    cta: '开始使用',
  },
  faq: {
    eyebrow: '常见问题',
    heading: '常见问题解答',
    items: [
      {
        q: '我的班级数据会去往哪里？',
        a: '不会去任何您不希望的地方。所有服务运行在 Cloudflare 边缘网络上，所有 AI 均通过 Cloudflare Workers AI 运行——班级数据绝不会发送给 OpenAI、ChatGPT 或任何外部 AI 服务商。学生姓名仅以「名 + 姓氏首字母」的形式存储。',
      },
      {
        q: '开始使用需要绑定银行卡吗？',
        a: '不需要。新账户自带起步额度，并设有默认每月 $20 的 AI 支出上限，您可以立即规划课程、布置作业、开展测评。平台没有订阅制——月末只按实际使用的 AI 结算，上限随时可调。',
      },
      {
        q: '支持哪些课程体系和考试局？',
        a: '全部支持。创建班级时粘贴您的课程大纲或教学要点，Guidelight 即会让作业、教案和模拟考试与之对齐。写作任务还可对照上传的考试局评分标准，生成 AI 范文，并支持学生反复修改打磨。',
      },
      {
        q: 'Guidelight 在中国大陆可以使用吗？',
        a: '可以。整个应用——包括所有 AI 功能——都运行在 Cloudflare 网络的自有域名上，浏览器不会调用任何外部 AI 服务商。无论是否使用 VPN，都能正常访问。',
      },
      {
        q: 'AI 批改是如何工作的？',
        a: 'AI 会依据您的评分标准为每次作答打分并给出书面反馈；在您审阅并发布之前，学生不会看到任何结果。每一次评分都会计入学生档案，用于薄弱点分析和考试就绪度评估。',
      },
      {
        q: '平台会存储哪些学生数据？可以删除吗？',
        a: '只存教学所需的最少数据：显示名（名 + 姓氏首字母）、选填的兴趣与职业志向，以及学生提交的作业。账户数据的导出与删除功能均已内置，符合 GDPR 要求。',
      },
    ],
  },
  signoff: {
    line: '以 AI 原生的作业、测评与数据洞察，引领学生走向卓越。',
    cta: '开始使用',
  },
}

export type LandingLang = 'en' | 'zh'

export const landingCopy: Record<LandingLang, LandingCopy> = { en, zh }
