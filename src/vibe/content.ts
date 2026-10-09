/**
 * Content bank for the Bangkok Vibe quiz.
 *
 * Six NON-POLITICAL lifestyle categories. Each has a "+" and a "−" pole, and
 * every activity below belongs to exactly one pole. Questions are assembled
 * from these pieces by `generator.ts`, so the bank can grow without anyone
 * hand-writing new questions.
 *
 * Rule for anyone adding content: an item must describe how someone likes to
 * spend time in the city. Nothing about policy, rules, who should decide,
 * public money, religion, politics, income or identity.
 *
 * Places come from BMA's own VisitBangkok (visit.bangkok.go.th) recommended
 * routes and attractions, so quiz scenes double as real event ideas.
 */

export type Text = { th: string; en: string };

export const CATEGORIES = [
  "energy",
  "explore",
  "rhythm",
  "motion",
  "plan",
  "culture",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** +1 = the first pole in POLES, −1 = the second. */
export type Pole = 1 | -1;

type PoleInfo = {
  label: Text;
  /** Used to build the result name, e.g. "Curious" + "Night Owl". */
  adjective: Text;
  noun: Text;
};

export const POLES: Record<Category, { plus: PoleInfo; minus: PoleInfo; name: Text }> = {
  energy: {
    name: { en: "Social energy", th: "พลังโซเชียล" },
    plus: {
      label: { en: "Buzz", th: "คึกคัก" },
      adjective: { en: "Lively", th: "สายคึกคัก" },
      noun: { en: "Connector", th: "นักเชื่อมคน" },
    },
    minus: {
      label: { en: "Chill", th: "ชิล" },
      adjective: { en: "Easygoing", th: "สายชิล" },
      noun: { en: "Listener", th: "นักฟัง" },
    },
  },
  explore: {
    name: { en: "Exploring", th: "การสำรวจ" },
    plus: {
      label: { en: "Discover", th: "ลองของใหม่" },
      adjective: { en: "Curious", th: "สายลองของใหม่" },
      noun: { en: "Explorer", th: "นักสำรวจ" },
    },
    minus: {
      label: { en: "Familiar", th: "ร้านประจำ" },
      adjective: { en: "Loyal", th: "สายร้านประจำ" },
      noun: { en: "Regular", th: "ขาประจำ" },
    },
  },
  rhythm: {
    name: { en: "Daily rhythm", th: "จังหวะชีวิต" },
    plus: {
      label: { en: "Night owl", th: "นกฮูกกลางคืน" },
      adjective: { en: "Late-Night", th: "สายกลางคืน" },
      noun: { en: "Night Owl", th: "นกฮูกราตรี" },
    },
    minus: {
      label: { en: "Early bird", th: "ตื่นเช้า" },
      adjective: { en: "Sunrise", th: "สายตื่นเช้า" },
      noun: { en: "Early Riser", th: "คนตื่นเช้า" },
    },
  },
  motion: {
    name: { en: "Activity style", th: "สไตล์กิจกรรม" },
    plus: {
      label: { en: "Move", th: "ขยับตัว" },
      adjective: { en: "Active", th: "สายแอคทีฟ" },
      noun: { en: "Mover", th: "สายลุย" },
    },
    minus: {
      label: { en: "Savour", th: "นั่งละเมียด" },
      adjective: { en: "Slow-Sipping", th: "สายนั่งละเมียด" },
      noun: { en: "Savourer", th: "นักละเมียด" },
    },
  },
  plan: {
    name: { en: "Planning style", th: "สไตล์การวางแผน" },
    plus: {
      label: { en: "Spontaneous", th: "ไปตามใจ" },
      adjective: { en: "Spontaneous", th: "สายไปตามใจ" },
      noun: { en: "Wanderer", th: "นักเดินเตร็ด" },
    },
    minus: {
      label: { en: "Planner", th: "วางแผน" },
      adjective: { en: "Organised", th: "สายวางแผน" },
      noun: { en: "Planner", th: "นักวางแผน" },
    },
  },
  culture: {
    name: { en: "Culture taste", th: "รสนิยมวัฒนธรรม" },
    plus: {
      label: { en: "Creative", th: "ครีเอทีฟ" },
      adjective: { en: "Creative", th: "สายครีเอทีฟ" },
      noun: { en: "Trendspotter", th: "นักล่าเทรนด์" },
    },
    minus: {
      label: { en: "Old-town", th: "เมืองเก่า" },
      adjective: { en: "Old-Town", th: "สายเมืองเก่า" },
      noun: { en: "Heritage Lover", th: "คนรักย่านเก่า" },
    },
  },
};

/** Activities per pole. Phrased to fit "Which sounds better: X or Y?" */
export const ACTIVITIES: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [
      { en: "squeezing through a packed night market", th: "เดินเบียดตลาดนัดกลางคืนที่คนแน่น ๆ" },
      { en: "a big table where everyone talks at once", th: "โต๊ะใหญ่ที่ทุกคนคุยกันเสียงดังเฮฮา" },
      { en: "a rooftop party with a DJ", th: "ปาร์ตี้รูฟท็อปที่มีดีเจ" },
      { en: "a festival with live music and crowds", th: "เทศกาลดนตรีสดที่คนเยอะ ๆ" },
      { en: "a team game with lots of cheering", th: "เกมทีมที่เชียร์กันเสียงดัง" },
      { en: "meeting ten new people in one evening", th: "รู้จักคนใหม่สิบคนในคืนเดียว" },
      { en: "a street-food crawl with eight new faces", th: "ตระเวนกินสตรีทฟู้ดกับเพื่อนใหม่แปดคน" },
      { en: "a karaoke room with the whole group", th: "ร้องคาราโอเกะยกแก๊ง" },
    ],
    minus: [
      { en: "a quiet corner in a small café", th: "มุมเงียบ ๆ ในคาเฟ่เล็ก ๆ" },
      { en: "a slow chat with two or three people", th: "นั่งคุยช้า ๆ กับคนสองสามคน" },
      { en: "a calm bench by the river", th: "ม้านั่งริมแม่น้ำเงียบ ๆ" },
      { en: "a small book or craft circle", th: "วงอ่านหนังสือหรืองานฝีมือเล็ก ๆ" },
      { en: "a peaceful picnic in the park", th: "ปิกนิกในสวนแบบสงบ ๆ" },
      { en: "a low-key board game table", th: "โต๊ะบอร์ดเกมชิล ๆ" },
      { en: "a slow walk with one good friend", th: "เดินช้า ๆ กับเพื่อนสนิทหนึ่งคน" },
      { en: "a tea tasting for four", th: "ชิมชาวงเล็กสี่คน" },
    ],
  },
  explore: {
    plus: [
      { en: "a soi you've never walked down", th: "ซอยที่ไม่เคยเดินเข้าไปมาก่อน" },
      { en: "a dish you can't pronounce yet", th: "เมนูที่ยังอ่านชื่อไม่ถูก" },
      { en: "a hidden spot someone just told you about", th: "ร้านลับที่เพื่อนเพิ่งบอกต่อ" },
      { en: "a pop-up you saw online this morning", th: "ป๊อปอัปที่เพิ่งเห็นในโซเชียลเมื่อเช้า" },
      { en: "a district across the river you rarely visit", th: "ย่านฝั่งธนฯ ที่ไม่ค่อยได้ไป" },
      { en: "a class in something you've never tried", th: "คลาสสิ่งที่ไม่เคยลองมาก่อน" },
      { en: "a ferry stop you've never got off at", th: "ท่าเรือที่ไม่เคยลงมาก่อน" },
      { en: "a market in a district you've never visited", th: "ตลาดในเขตที่ไม่เคยไป" },
    ],
    minus: [
      { en: "your go-to noodle shop", th: "ร้านก๋วยเตี๋ยวประจำ" },
      { en: "a café that already knows your order", th: "คาเฟ่ที่รู้ว่าเราจะสั่งอะไร" },
      { en: "a park where you know every path", th: "สวนที่รู้จักทุกทางเดิน" },
      { en: "a favourite market you could walk blindfolded", th: "ตลาดโปรดที่หลับตาเดินก็ได้" },
      { en: "your usual running route, with company", th: "เส้นทางวิ่งประจำ แต่มีเพื่อนวิ่งด้วย" },
      { en: "a restaurant you'd recommend to anyone", th: "ร้านที่กล้าแนะนำให้ทุกคน" },
      { en: "the café where you always sit by the window", th: "คาเฟ่ที่นั่งริมหน้าต่างประจำ" },
      { en: "the street-food stall you've loved for years", th: "ร้านข้างทางที่รักมาหลายปี" },
    ],
  },
  rhythm: {
    plus: [
      { en: "a 10 pm street-food crawl", th: "ตระเวนกินสตรีทฟู้ดตอนสี่ทุ่ม" },
      { en: "a late-night jazz bar", th: "บาร์แจ๊สดึก ๆ" },
      { en: "a midnight bike ride through the old town", th: "ปั่นจักรยานเที่ยงคืนรอบเมืองเก่า" },
      { en: "a night market after 9 pm", th: "ตลาดกลางคืนหลังสามทุ่ม" },
      { en: "a late movie and dessert after", th: "หนังรอบดึกแล้วไปต่อของหวาน" },
      { en: "a rooftop that stays open past midnight", th: "รูฟท็อปที่เปิดเลยเที่ยงคืน" },
      { en: "a late-night khao tom run", th: "ไปกินข้าวต้มรอบดึก" },
    ],
    minus: [
      { en: "a 6 am run in the park", th: "วิ่งในสวนตอนหกโมงเช้า" },
      { en: "a morning market before the heat", th: "ตลาดเช้าก่อนแดดแรง" },
      { en: "sunrise by the river", th: "ดูพระอาทิตย์ขึ้นริมแม่น้ำ" },
      { en: "breakfast jok at 7 am", th: "โจ๊กมื้อเช้าตอนเจ็ดโมง" },
      { en: "a weekend morning yoga session", th: "โยคะเช้าวันหยุด" },
      { en: "giving alms and coffee at dawn", th: "ตักบาตรแล้วจิบกาแฟยามเช้า" },
      { en: "a sunrise bike ride by the river", th: "ปั่นจักรยานรับแสงเช้าริมแม่น้ำ" },
    ],
  },
  motion: {
    plus: [
      { en: "a walking food quest", th: "เดินตามล่าของกิน" },
      { en: "a bike tour", th: "ปั่นจักรยานเที่ยว" },
      { en: "kayaking along a khlong", th: "พายเรือคายัคในคลอง" },
      { en: "a pickup badminton or football game", th: "แบดมินตันหรือฟุตบอลขาจร" },
      { en: "a hands-on cooking class", th: "คลาสทำอาหารลงมือเอง" },
      { en: "a dance class", th: "คลาสเต้น" },
      { en: "a Muay Thai taster class", th: "คลาสมวยไทยสำหรับมือใหม่" },
      { en: "a volunteer park clean-up", th: "อาสาเก็บขยะในสวน" },
    ],
    minus: [
      { en: "a long lunch where nobody rushes", th: "มื้อกลางวันยาว ๆ ไม่มีใครรีบ" },
      { en: "a gallery you take really slowly", th: "แกลเลอรีที่เดินดูช้า ๆ" },
      { en: "a rooftop seat watching the city", th: "นั่งชมเมืองบนรูฟท็อป" },
      { en: "a tasting table", th: "โต๊ะชิมอาหาร" },
      { en: "a film screening", th: "ฉายหนังแล้วนั่งดูด้วยกัน" },
      { en: "a long talk over Thai tea", th: "คุยยาว ๆ กับชาไทยสักแก้ว" },
      { en: "a picnic with nothing to do but talk", th: "ปิกนิกที่มีแค่การนั่งคุย" },
      { en: "an afternoon tea that runs long", th: "จิบชายามบ่ายแบบยาว ๆ" },
    ],
  },
  plan: {
    plus: [
      { en: "deciding where to eat when you get hungry", th: "หิวแล้วค่อยคิดว่าจะกินอะไร" },
      { en: "following whatever looks interesting", th: "เดินตามสิ่งที่น่าสนใจไปเรื่อย ๆ" },
      { en: "saying yes to a last-minute invite", th: "ตอบรับคำชวนกะทันหัน" },
      { en: "picking a random BTS stop and exploring", th: "สุ่มลงสถานี BTS แล้วเดินสำรวจ" },
      { en: "no itinerary, just vibes", th: "ไม่มีแพลน ไปตามฟีล" },
      { en: "hopping on the first boat that comes", th: "ขึ้นเรือลำแรกที่มาถึง" },
      { en: "letting the group pick on the spot", th: "ให้กลุ่มเลือกกันหน้างาน" },
    ],
    minus: [
      { en: "booking the table a week ahead", th: "จองโต๊ะล่วงหน้าหนึ่งอาทิตย์" },
      { en: "a route planned stop by stop", th: "เส้นทางที่วางไว้ทุกจุด" },
      { en: "checking opening hours and reviews first", th: "เช็กเวลาเปิดและรีวิวก่อนไป" },
      { en: "a calendar invite with the whole plan", th: "นัดในปฏิทินพร้อมแพลนครบ" },
      { en: "knowing exactly how you're getting home", th: "รู้ชัดว่าจะกลับบ้านยังไง" },
      { en: "a shared list of three places to try", th: "ลิสต์สามที่ที่จะลองแชร์ให้ทุกคน" },
      { en: "tickets booked before anyone asks", th: "จองตั๋วไว้ก่อนใครจะถาม" },
    ],
  },
  culture: {
    plus: [
      { en: "a contemporary art gallery", th: "แกลเลอรีศิลปะร่วมสมัย" },
      { en: "a design and makers market", th: "ตลาดงานดีไซน์และงานคราฟต์ใหม่ ๆ" },
      { en: "an indie café with a great playlist", th: "คาเฟ่อินดี้เพลงเพราะ" },
      { en: "a street-art walk", th: "เดินชมสตรีทอาร์ต" },
      { en: "a live indie gig", th: "ดูวงอินดี้เล่นสด" },
      { en: "a Bangkok Design Week installation", th: "งานจัดแสดงในบางกอกดีไซน์วีก" },
      { en: "a new indie bookshop", th: "ร้านหนังสืออิสระเปิดใหม่" },
    ],
    minus: [
      { en: "an old-town temple walk", th: "เดินไหว้พระย่านเมืองเก่า" },
      { en: "a heritage shophouse street", th: "ถนนตึกแถวเก่าทรงคุณค่า" },
      { en: "a traditional market", th: "ตลาดเก่าแบบดั้งเดิม" },
      { en: "a Thai craft workshop", th: "เวิร์กช็อปงานหัตถศิลป์ไทย" },
      { en: "a historic canal community", th: "ชุมชนริมคลองเก่าแก่" },
      { en: "a Thai classical music performance", th: "การแสดงดนตรีไทย" },
      { en: "a shadow puppet show", th: "การแสดงหนังตะลุง" },
      { en: "a walk through a century-old market", th: "เดินตลาดเก่าอายุร้อยปี" },
    ],
  },
};

/**
 * Places from VisitBangkok routes/attractions plus everyday hangouts. Used as
 * scenery in prompts only — the place never decides the score.
 */
export const PLACES: Text[] = [
  { en: "Yaowarat", th: "เยาวราช" },
  { en: "Talat Phlu", th: "ตลาดพลู" },
  { en: "Khlong Bang Luang", th: "คลองบางหลวง" },
  { en: "Charoenkrung–Talat Noi", th: "เจริญกรุง-ตลาดน้อย" },
  { en: "Little India (Phahurat)", th: "ลิตเติ้ลอินเดีย พาหุรัด" },
  { en: "Rattanakosin Island", th: "เกาะรัตนโกสินทร์" },
  { en: "Charoen Nakhon Road", th: "ถนนเจริญนคร" },
  { en: "Asiatique", th: "เอเชียทีค" },
  { en: "Lumphini Park", th: "สวนลุมพินี" },
  { en: "Benjakitti Forest Park", th: "สวนป่าเบญจกิติ" },
  { en: "Ari", th: "อารีย์" },
  { en: "Chatuchak", th: "จตุจักร" },
  { en: "Siam", th: "สยาม" },
  { en: "Wat Arun riverside", th: "ริมน้ำวัดอรุณ" },
  { en: "Bang Krachao", th: "บางกระเจ้า" },
  { en: "Thonburi canals", th: "คลองฝั่งธนฯ" },
  { en: "Sanam Luang", th: "สนามหลวง" },
  { en: "Phra Athit Road", th: "ถนนพระอาทิตย์" },
  { en: "Ratchada night market", th: "ตลาดนัดรัชดา" },
  { en: "Song Wat Road", th: "ถนนทรงวาด" },
];

export const WHENS: Text[] = [
  { en: "Saturday morning", th: "เช้าวันเสาร์" },
  { en: "After work on Thursday", th: "หลังเลิกงานวันพฤหัสฯ" },
  { en: "Sunday afternoon", th: "บ่ายวันอาทิตย์" },
  { en: "A rainy Friday evening", th: "เย็นวันศุกร์ที่ฝนตก" },
  { en: "A long weekend", th: "วันหยุดยาว" },
  { en: "A cool December evening", th: "เย็นวันที่อากาศเย็นในเดือนธันวาคม" },
  { en: "A hot April afternoon", th: "บ่ายวันร้อน ๆ เดือนเมษายน" },
  { en: "Late on a Saturday night", th: "ดึกคืนวันเสาร์" },
];

export const COMPANIONS: Text[] = [
  { en: "a new friend from a BKK Social event", th: "เพื่อนใหม่จากกิจกรรม BKK Social" },
  { en: "a friend visiting from another province", th: "เพื่อนที่มาจากต่างจังหวัด" },
  { en: "a colleague who just moved to Bangkok", th: "เพื่อนร่วมงานที่เพิ่งย้ายมากรุงเทพฯ" },
  { en: "your small group from last week", th: "กลุ่มเล็ก ๆ จากอาทิตย์ที่แล้ว" },
];

/** First-person statements for 1–5 "how much is this you?" items. */
export const STATEMENTS: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [{ en: "The more people at the table, the better the night.", th: "คนยิ่งเยอะ คืนนั้นยิ่งสนุก" }, { en: "I love walking into a room full of people I don't know yet.", th: "ฉันชอบเดินเข้าไปในห้องที่เต็มไปด้วยคนที่ยังไม่รู้จัก" }],
    minus: [{ en: "I recharge best with one or two people, not a crowd.", th: "ฉันชาร์จพลังได้ดีกับคนหนึ่งสองคน มากกว่าคนเยอะ ๆ" }, { en: "A quiet table where I can hear everyone is my kind of night.", th: "โต๊ะเงียบ ๆ ที่ได้ยินทุกคนชัด คือคืนในแบบของฉัน" }],
  },
  explore: {
    plus: [{ en: "If I've been somewhere before, I'd rather try somewhere new.", th: "ถ้าเคยไปแล้ว ฉันอยากลองที่ใหม่มากกว่า" }, { en: "I'd cross the whole city for a place I've never been.", th: "ฉันยอมข้ามเมืองเพื่อไปที่ที่ไม่เคยไป" }],
    minus: [{ en: "A great regular spot beats a gamble on somewhere new.", th: "ร้านประจำดี ๆ ดีกว่าเสี่ยงลองร้านใหม่" }, { en: "I like being a regular somewhere.", th: "ฉันชอบเป็นขาประจำของที่ไหนสักที่" }],
  },
  rhythm: {
    plus: [{ en: "My best conversations happen after 10 pm.", th: "บทสนทนาที่ดีที่สุดของฉันเกิดหลังสี่ทุ่ม" }, { en: "Bangkok only really wakes up after dark.", th: "กรุงเทพฯ เริ่มมีชีวิตจริง ๆ ก็ตอนมืดแล้ว" }],
    minus: [{ en: "I'd rather meet for breakfast than for a late drink.", th: "ฉันอยากนัดกินมื้อเช้ามากกว่านัดดึก" }, { en: "My favourite Bangkok is the city before 9 am.", th: "กรุงเทพฯ ที่ฉันชอบที่สุดคือก่อนเก้าโมงเช้า" }],
  },
  motion: {
    plus: [{ en: "I get to know people best while doing something together.", th: "ฉันรู้จักคนอื่นได้ดีที่สุดตอนทำกิจกรรมด้วยกัน" }, { en: "A good day out leaves me a little sweaty.", th: "วันที่ดีคือวันที่ได้เหงื่อออกนิด ๆ" }],
    minus: [{ en: "Give me a good seat and a long conversation.", th: "ขอที่นั่งดี ๆ กับบทสนทนายาว ๆ ก็พอ" }, { en: "I'd rather taste ten things than walk ten kilometres.", th: "ขอชิมสิบอย่างดีกว่าเดินสิบกิโล" }],
  },
  plan: {
    plus: [{ en: "The best days out are the ones nobody planned.", th: "วันที่สนุกที่สุดคือวันที่ไม่มีใครวางแผน" }, { en: "A last-minute message saying \"come now?\" makes my day.", th: "ข้อความชวนกะทันหันว่า \"มาตอนนี้เลยไหม?\" ทำให้ฉันดีใจ" }],
    minus: [{ en: "I enjoy a day out more when I know the plan.", th: "ฉันสนุกกว่าเมื่อรู้แพลนล่วงหน้า" }, { en: "I'm usually the one who makes the group plan.", th: "ฉันมักเป็นคนวางแผนให้กลุ่ม" }],
  },
  culture: {
    plus: [{ en: "I'm always looking for Bangkok's newest creative spots.", th: "ฉันชอบตามหาที่ครีเอทีฟใหม่ ๆ ในกรุงเทพฯ" }, { en: "Design weeks and gallery openings are my kind of festival.", th: "งานดีไซน์วีกและเปิดนิทรรศการคือเทศกาลของฉัน" }],
    minus: [{ en: "Old Bangkok neighbourhoods are where I feel most at home.", th: "ย่านเก่าของกรุงเทพฯ ทำให้ฉันรู้สึกเหมือนบ้าน" }, { en: "I could spend a whole day in an old shophouse district.", th: "ฉันใช้เวลาทั้งวันในย่านตึกแถวเก่าได้" }],
  },
};
