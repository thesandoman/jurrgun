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
      { en: "a block party on a walking street", th: "ปาร์ตี้บนถนนคนเดิน" },
      { en: "a pub quiz with a team of strangers", th: "ควิซในผับกับทีมที่เพิ่งรู้จักกัน" },
      { en: "a countdown in a crowd by the river", th: "เคาท์ดาวน์ริมแม่น้ำท่ามกลางผู้คน" },
      { en: "a dance floor that fills up fast", th: "ฟลอร์เต้นรำที่คนเต็มเร็ว" },
      { en: "a mookata dinner for twelve", th: "หมูกระทะโต๊ะยาวสิบสองคน" },
      { en: "a concert in a packed stadium", th: "คอนเสิร์ตในสนามที่คนแน่น" },
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
      { en: "a quiet dinner at a friend's place", th: "มื้อเย็นเงียบ ๆ ที่บ้านเพื่อน" },
      { en: "a boat ride with one friend", th: "นั่งเรือเล่นกับเพื่อนหนึ่งคน" },
      { en: "a reading afternoon in a library café", th: "บ่ายอ่านหนังสือในคาเฟ่ห้องสมุด" },
      { en: "a cooking night for three at home", th: "ทำอาหารกินกันสามคนที่บ้าน" },
      { en: "a listening bar with good speakers and low voices", th: "บาร์ฟังเพลงลำโพงดี คนคุยกันเบา ๆ" },
      { en: "a sunset on a quiet pier", th: "ดูพระอาทิตย์ตกที่ท่าเรือเงียบ ๆ" },
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
      { en: "a cuisine you've never tasted", th: "อาหารชาติที่ยังไม่เคยชิม" },
      { en: "a night market that opened last month", th: "ตลาดกลางคืนที่เพิ่งเปิดเดือนที่แล้ว" },
      { en: "a canal route you've only seen on a map", th: "เส้นทางคลองที่เคยเห็นแค่ในแผนที่" },
      { en: "a workshop by a maker you just discovered", th: "เวิร์กช็อปของคนทำงานคราฟต์ที่เพิ่งรู้จัก" },
      { en: "the last stop on a train line", th: "สถานีสุดท้ายของรถไฟฟ้าสักสาย" },
      { en: "a fruit you've never seen at the market", th: "ผลไม้ที่ไม่เคยเห็นในตลาด" },
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
      { en: "the khao man gai stall you'd queue for any day", th: "ร้านข้าวมันไก่ที่ยอมต่อคิวได้ทุกวัน" },
      { en: "a Sunday ritual you never skip", th: "กิจวัตรวันอาทิตย์ที่ไม่เคยพลาด" },
      { en: "the bookshop where you know every shelf", th: "ร้านหนังสือที่รู้จักทุกชั้น" },
      { en: "a walk around your own neighbourhood", th: "เดินเล่นรอบย่านบ้านตัวเอง" },
      { en: "the massage place you've trusted for years", th: "ร้านนวดที่ไว้ใจมาหลายปี" },
      { en: "a dessert shop you've loved since school", th: "ร้านขนมที่รักตั้งแต่สมัยเรียน" },
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
      { en: "a 1 am bowl of boat noodles", th: "ก๋วยเตี๋ยวเรือตอนตีหนึ่ง" },
      { en: "a night run when the city cools down", th: "วิ่งตอนกลางคืนตอนเมืองเย็นลง" },
      { en: "a gig that starts at 11 pm", th: "คอนเสิร์ตที่เริ่มห้าทุ่ม" },
      { en: "a midnight dessert run in Yaowarat", th: "ไปกินของหวานเที่ยงคืนที่เยาวราช" },
      { en: "a night boat along the river", th: "นั่งเรือชมแม่น้ำยามค่ำ" },
      { en: "a board game night that runs past 1 am", th: "บอร์ดเกมไนท์ที่เล่นยาวเลยตีหนึ่ง" },
      { en: "a 24-hour café after a late show", th: "คาเฟ่ 24 ชั่วโมงหลังดูโชว์รอบดึก" },
    ],
    minus: [
      { en: "a 6 am run in the park", th: "วิ่งในสวนตอนหกโมงเช้า" },
      { en: "a morning market before the heat", th: "ตลาดเช้าก่อนแดดแรง" },
      { en: "sunrise by the river", th: "ดูพระอาทิตย์ขึ้นริมแม่น้ำ" },
      { en: "breakfast jok at 7 am", th: "โจ๊กมื้อเช้าตอนเจ็ดโมง" },
      { en: "a weekend morning yoga session", th: "โยคะเช้าวันหยุด" },
      { en: "coffee on a quiet pier at dawn", th: "กาแฟริมท่าเรือเงียบ ๆ ตอนรุ่งสาง" },
      { en: "a sunrise bike ride by the river", th: "ปั่นจักรยานรับแสงเช้าริมแม่น้ำ" },
      { en: "a dawn walk in Lumphini with the tai chi groups", th: "เดินรุ่งเช้าในสวนลุมฯ ท่ามกลางกลุ่มรำไทเก๊ก" },
      { en: "patongko and soy milk at 6:30", th: "ปาท่องโก๋กับน้ำเต้าหู้ตอนหกโมงครึ่ง" },
      { en: "a flower market visit before sunrise", th: "เดินตลาดดอกไม้ก่อนพระอาทิตย์ขึ้น" },
      { en: "an early swim before work", th: "ว่ายน้ำเช้าก่อนไปทำงาน" },
      { en: "a breakfast meet-up at 8 am", th: "นัดกินมื้อเช้าตอนแปดโมง" },
      { en: "a morning birdwatching walk", th: "เดินดูนกยามเช้า" },
      { en: "an early boat before the river gets busy", th: "นั่งเรือเช้าก่อนแม่น้ำจะคึกคัก" },
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
      { en: "a rock-climbing gym session", th: "ปีนผาในยิม" },
      { en: "a sunset run along the river", th: "วิ่งรับลมเย็นริมแม่น้ำ" },
      { en: "a frisbee game in the park", th: "เล่นจานร่อนในสวน" },
      { en: "a long walk across three districts", th: "เดินยาวข้ามสามเขต" },
      { en: "a pottery wheel class", th: "คลาสปั้นเซรามิกแป้นหมุน" },
      { en: "a takraw circle in the park", th: "วงตะกร้อในสวน" },
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
      { en: "a long brunch with endless refills", th: "บรันช์ยาว ๆ เติมได้ไม่อั้น" },
      { en: "a cooking demo you just watch and taste", th: "ดูเชฟสาธิตแล้วชิม" },
      { en: "a slow boat with a good view", th: "นั่งเรือช้า ๆ วิวดี" },
      { en: "a coffee cupping", th: "ชิมกาแฟแบบคัปปิ้ง" },
      { en: "a reading hour in a garden café", th: "นั่งอ่านหนังสือในคาเฟ่สวน" },
      { en: "a dinner of four courses and three hours", th: "มื้อค่ำสี่คอร์สที่นั่งกันสามชั่วโมง" },
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
      { en: "following the smell of grilled pork down a soi", th: "เดินตามกลิ่นหมูปิ้งเข้าซอย" },
      { en: "a day trip decided over breakfast", th: "ทริปวันเดียวที่ตัดสินใจตอนกินข้าวเช้า" },
      { en: "joining whatever's happening at the park", th: "ร่วมวงอะไรก็ได้ที่กำลังเกิดขึ้นในสวน" },
      { en: "turning a quick coffee into a whole afternoon", th: "จากกาแฟแก้วเดียวกลายเป็นทั้งบ่าย" },
      { en: "letting a friend surprise you", th: "ให้เพื่อนเซอร์ไพรส์" },
      { en: "taking the long way home on purpose", th: "ตั้งใจกลับบ้านทางอ้อม" },
      { en: "walking into a show without checking the lineup", th: "เดินเข้างานโดยไม่ดูไลน์อัพ" },
    ],
    minus: [
      { en: "booking the table a week ahead", th: "จองโต๊ะล่วงหน้าหนึ่งอาทิตย์" },
      { en: "a route planned stop by stop", th: "เส้นทางที่วางไว้ทุกจุด" },
      { en: "checking opening hours and reviews first", th: "เช็กเวลาเปิดและรีวิวก่อนไป" },
      { en: "a calendar invite with the whole plan", th: "นัดในปฏิทินพร้อมแพลนครบ" },
      { en: "knowing exactly how you're getting home", th: "รู้ชัดว่าจะกลับบ้านยังไง" },
      { en: "a shared list of three places to try", th: "ลิสต์สามที่ที่จะลองแชร์ให้ทุกคน" },
      { en: "tickets booked before anyone asks", th: "จองตั๋วไว้ก่อนใครจะถาม" },
      { en: "a packing list for a day out", th: "ลิสต์ของที่ต้องพกไปเที่ยว" },
      { en: "a group chat poll to pick the date", th: "ทำโพลในแชตกลุ่มเพื่อเลือกวัน" },
      { en: "a Sunday spent getting the week ready", th: "วันอาทิตย์ที่ใช้เตรียมสัปดาห์หน้าให้พร้อม" },
      { en: "a timed route that beats the traffic", th: "เส้นทางจับเวลาที่หนีรถติด" },
      { en: "a reservation at the place everyone wants", th: "จองร้านที่ทุกคนอยากไปได้ทัน" },
      { en: "a weather check and a plan B", th: "เช็กอากาศและมีแผนสำรอง" },
      { en: "a meeting point and a time everyone agreed on", th: "จุดนัดและเวลาที่ทุกคนตกลงกันแล้ว" },
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
      { en: "an artist talk in a converted warehouse", th: "ฟังศิลปินเล่างานในโกดังรีโนเวต" },
      { en: "a zine fair", th: "งานแฟร์หนังสือทำมือ (ซีน)" },
      { en: "an indie film night", th: "คืนฉายหนังอินดี้" },
      { en: "a vintage and thrift market", th: "ตลาดวินเทจและของมือสอง" },
      { en: "a photo walk at golden hour", th: "เดินถ่ายรูปช่วงแสงทอง" },
      { en: "a pop-up dinner by a young chef", th: "ป๊อปอัปดินเนอร์ของเชฟรุ่นใหม่" },
      { en: "a light art festival", th: "เทศกาลศิลปะแสงสี" },
    ],
    minus: [
      { en: "an old-town temple walk", th: "เดินชมวัดย่านเมืองเก่า" },
      { en: "a heritage shophouse street", th: "ถนนตึกแถวเก่าทรงคุณค่า" },
      { en: "a traditional market", th: "ตลาดเก่าแบบดั้งเดิม" },
      { en: "a Thai craft workshop", th: "เวิร์กช็อปงานหัตถศิลป์ไทย" },
      { en: "a historic canal community", th: "ชุมชนริมคลองเก่าแก่" },
      { en: "a Thai classical music performance", th: "การแสดงดนตรีไทย" },
      { en: "a shadow puppet show", th: "การแสดงหนังตะลุง" },
      { en: "a walk through a century-old market", th: "เดินตลาดเก่าอายุร้อยปี" },
      { en: "a benjarong painting class", th: "คลาสเพ้นท์เบญจรงค์" },
      { en: "a khon masked dance performance", th: "การแสดงโขน" },
      { en: "an old-recipe Thai dessert shop", th: "ร้านขนมไทยสูตรโบราณ" },
      { en: "a wooden house museum by the canal", th: "พิพิธภัณฑ์บ้านไม้ริมคลอง" },
      { en: "a garland-making workshop", th: "เวิร์กช็อปร้อยมาลัย" },
      { en: "a likay show at a neighbourhood fair", th: "ดูลิเกในงานย่านเก่า" },
    ],
  },
};

/**
 * A place in the scenery of a prompt. `districts` (DISTRICTS values) and `tags`
 * (INTERESTS values) only steer which places a person sees more often; the
 * place never decides the score.
 */
export type Place = Text & { districts: readonly string[]; tags: readonly string[] };

const place = (en: string, th: string, districts: string[], tags: string[]): Place => ({ en, th, districts, tags });

/** VisitBangkok routes and attractions plus everyday hangouts across the city. */
export const PLACES: Place[] = [
  place("Yaowarat", "เยาวราช", ["samphanthawong"], ["food", "nightlife", "city"]),
  place("Talat Phlu", "ตลาดพลู", ["thon_buri"], ["food", "city"]),
  place("Khlong Bang Luang", "คลองบางหลวง", ["phasi_charoen", "bangkok_yai"], ["art", "culture"]),
  place("Charoenkrung and Talat Noi", "เจริญกรุง-ตลาดน้อย", ["bang_rak", "samphanthawong"], ["art", "photography", "cafes"]),
  place("Little India (Phahurat)", "ลิตเติ้ลอินเดีย พาหุรัด", ["phra_nakhon"], ["food", "culture"]),
  place("Rattanakosin Island", "เกาะรัตนโกสินทร์", ["phra_nakhon"], ["culture", "city"]),
  place("Charoen Nakhon Road", "ถนนเจริญนคร", ["khlong_san"], ["cafes", "art"]),
  place("Asiatique", "เอเชียทีค", ["bang_kho_laem"], ["nightlife"]),
  place("Lumphini Park", "สวนลุมพินี", ["pathum_wan"], ["running", "sports"]),
  place("Benjakitti Forest Park", "สวนป่าเบญจกิติ", ["khlong_toei"], ["running", "photography"]),
  place("Ari", "อารีย์", ["phaya_thai"], ["cafes", "food"]),
  place("Chatuchak", "จตุจักร", ["chatuchak"], ["food", "art", "pets"]),
  place("Siam", "สยาม", ["pathum_wan"], ["city", "music"]),
  place("Wat Arun riverside", "ริมน้ำวัดอรุณ", ["bangkok_yai"], ["culture", "photography"]),
  place("Bang Krachao", "บางกระเจ้า", [], ["sports", "running"]),
  place("Thonburi canals", "คลองฝั่งธนฯ", ["bangkok_noi", "taling_chan"], ["culture", "city"]),
  place("Sanam Luang", "สนามหลวง", ["phra_nakhon"], ["culture"]),
  place("Phra Athit Road", "ถนนพระอาทิตย์", ["phra_nakhon"], ["music", "nightlife"]),
  place("Ratchada night market", "ตลาดนัดรัชดา", ["din_daeng", "huai_khwang"], ["nightlife", "food"]),
  place("Song Wat Road", "ถนนทรงวาด", ["samphanthawong"], ["art", "cafes", "photography"]),
  place("Nang Loeng Market", "ตลาดนางเลิ้ง", ["pom_prap", "dusit"], ["food", "culture"]),
  place("Taling Chan Floating Market", "ตลาดน้ำตลิ่งชัน", ["taling_chan"], ["food"]),
  place("Khlong Lat Mayom", "คลองลัดมะยม", ["taling_chan"], ["food", "photography"]),
  place("Bangkok Art and Culture Centre", "หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร", ["pathum_wan"], ["art", "books"]),
  place("Thong Lo", "ทองหล่อ", ["watthana"], ["nightlife", "food", "cafes"]),
  place("Ekkamai", "เอกมัย", ["watthana"], ["cafes", "music"]),
  place("Banglamphu", "บางลำพู", ["phra_nakhon"], ["food", "nightlife", "languages"]),
  place("Khao San Road", "ถนนข้าวสาร", ["phra_nakhon"], ["nightlife", "languages"]),
  place("Pak Khlong Talat flower market", "ปากคลองตลาด", ["phra_nakhon"], ["photography", "culture"]),
  place("Santichaiprakan Park", "สวนสันติชัยปราการ", ["phra_nakhon"], ["running", "music"]),
  place("Rot Fai Park", "สวนรถไฟ", ["chatuchak"], ["running", "sports", "pets"]),
  place("Wang Lang Market", "ตลาดวังหลัง", ["bangkok_noi"], ["food"]),
  place("Hua Takhe Old Market", "ตลาดเก่าหัวตะเข้", ["lat_krabang"], ["culture", "photography", "art"]),
  place("Min Buri Old Market", "ตลาดมีนบุรี", ["min_buri"], ["food", "culture"]),
  place("Suan Luang Rama IX", "สวนหลวง ร.9", ["prawet"], ["running", "photography", "pets"]),
  place("Bang Khun Thian seaside", "ชายทะเลบางขุนเทียน", ["bang_khun_thian"], ["photography", "volunteering"]),
  place("Huai Khwang night market", "ตลาดกลางคืนห้วยขวาง", ["huai_khwang"], ["food", "nightlife"]),
  place("The Jam Factory", "เดอะแจมแฟคทอรี่", ["khlong_san"], ["art", "books", "cafes"]),
  place("Sam Yan", "สามย่าน", ["pathum_wan", "bang_rak"], ["food", "books", "games"]),
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
  { en: "Sunday morning", th: "เช้าวันอาทิตย์" },
  { en: "A Wednesday after a long day", th: "เย็นวันพุธหลังวันที่ยาวนาน" },
  { en: "A free Friday night", th: "คืนวันศุกร์ที่ว่าง" },
  { en: "Lunch break on a weekday", th: "พักเที่ยงวันธรรมดา" },
  { en: "A breezy evening after the rain", th: "เย็นลมโชยหลังฝนหยุด" },
  { en: "The first morning of a long weekend", th: "เช้าแรกของวันหยุดยาว" },
  { en: "Songkran afternoon", th: "บ่ายวันสงกรานต์" },
];

export type Companion = Text & { tags: readonly string[] };

const companion = (en: string, th: string, tags: string[] = []): Companion => ({ en, th, tags });

export const COMPANIONS: Companion[] = [
  companion("a new friend from a Jurrgun event", "เพื่อนใหม่จากกิจกรรม Jurrgun"),
  companion("a friend visiting from another province", "เพื่อนที่มาจากต่างจังหวัด"),
  companion("a colleague who just moved to Bangkok", "เพื่อนร่วมงานที่เพิ่งย้ายมากรุงเทพฯ"),
  companion("your small group from last week", "กลุ่มเล็ก ๆ จากอาทิตย์ที่แล้ว"),
  companion("a cousin visiting from Chiang Mai", "ญาติที่มาจากเชียงใหม่"),
  companion("a classmate you haven't seen in years", "เพื่อนสมัยเรียนที่ไม่ได้เจอกันหลายปี"),
  companion("a neighbour who just moved in", "เพื่อนบ้านที่เพิ่งย้ายเข้ามา"),
  companion("a friend from your running club", "เพื่อนจากกลุ่มวิ่ง", ["running", "sports"]),
  companion("a friend who never goes anywhere without a camera", "เพื่อนที่ไปไหนต้องพกกล้อง", ["photography"]),
  companion("your language-exchange partner", "คู่แลกเปลี่ยนภาษาของคุณ", ["languages"]),
  companion("a friend who reads more than anyone you know", "เพื่อนที่อ่านหนังสือเยอะที่สุดที่รู้จัก", ["books"]),
  companion("a friend who will eat anything once", "เพื่อนที่พร้อมลองกินทุกอย่าง", ["food"]),
  companion("a friend who always has a great playlist", "เพื่อนที่มีเพลย์ลิสต์ดีเสมอ", ["music", "nightlife"]),
  companion("your board game buddy", "เพื่อนสายบอร์ดเกม", ["games"]),
  companion("a friend who sketches everywhere they go", "เพื่อนที่ไปไหนก็สเก็ตช์ภาพ", ["art", "culture"]),
  companion("a friend and their very friendly dog", "เพื่อนกับน้องหมาขี้เล่นของเขา", ["pets"]),
  companion("a fellow volunteer from a park clean-up", "เพื่อนอาสาจากกิจกรรมเก็บขยะในสวน", ["volunteering"]),
  companion("a café-hopping friend", "เพื่อนสายตระเวนคาเฟ่", ["cafes"]),
];

/**
 * Everyday Bangkok moments, adapted from the scenario questions of the
 * original City Values draft ("you have a free Sunday…") with the civic
 * trade-off taken out. Each one is a sentence that opens a prompt.
 */
export const SITUATIONS: Text[] = [
  { en: "A free Sunday with nothing booked", th: "วันอาทิตย์ว่าง ๆ ไม่มีนัดอะไร" },
  { en: "A friend is visiting Bangkok for the weekend", th: "เพื่อนมาเที่ยวกรุงเทพฯ ช่วงสุดสัปดาห์" },
  { en: "It's raining hard on a Friday evening", th: "เย็นวันศุกร์ฝนตกหนัก" },
  { en: "You just moved to a new neighbourhood", th: "คุณเพิ่งย้ายมาอยู่ย่านใหม่" },
  { en: "It's the end of a long week", th: "จบสัปดาห์ที่ยาวนานแล้ว" },
  { en: "It's a festival night in the city", th: "คืนนี้มีเทศกาลในเมือง" },
  { en: "Your birthday falls on a Saturday", th: "วันเกิดคุณตรงกับวันเสาร์" },
  { en: "It's a cool morning in December", th: "เช้าที่อากาศเย็นในเดือนธันวาคม" },
  { en: "A three-day weekend just started", th: "วันหยุดยาวสามวันเพิ่งเริ่ม" },
  { en: "You have one free evening this week", th: "สัปดาห์นี้คุณว่างแค่หนึ่งเย็น" },
  { en: "A new friend asks you to plan the day", th: "เพื่อนใหม่ให้คุณเป็นคนวางแผนวันนี้" },
  { en: "It's the first sunny day after a week of rain", th: "วันแดดออกวันแรกหลังฝนตกมาทั้งอาทิตย์" },
  { en: "Your small group from Jurrgun wants to meet again", th: "กลุ่มเล็ก ๆ จาก Jurrgun อยากนัดเจอกันอีก" },
  { en: "Your cousin from Chiang Mai is in town for a day", th: "ญาติจากเชียงใหม่มากรุงเทพฯ หนึ่งวัน" },
  { en: "It's a hot April afternoon with nowhere to be", th: "บ่ายร้อน ๆ เดือนเมษายนที่ไม่ต้องไปไหน" },
  { en: "You just finished a big project", th: "คุณเพิ่งทำโปรเจกต์ใหญ่เสร็จ" },
  { en: "You have a day off in the middle of the week", th: "คุณได้หยุดกลางสัปดาห์หนึ่งวัน" },
  { en: "It's a breezy evening by the river", th: "เย็นนี้ลมพัดสบายริมแม่น้ำ" },
  { en: "It's Songkran week and the city slows down", th: "สัปดาห์สงกรานต์ เมืองช้าลง" },
];

/** First-person statements for 1–5 "how much is this you?" items. */
export const STATEMENTS: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [
      { en: "The more people at the table, the better the night.", th: "คนยิ่งเยอะ คืนนั้นยิ่งสนุก" },
      { en: "I love walking into a room full of people I don't know yet.", th: "ฉันชอบเดินเข้าไปในห้องที่เต็มไปด้วยคนที่ยังไม่รู้จัก" },
      { en: "A night with new faces gives me energy for the whole week.", th: "ได้เจอหน้าใหม่ ๆ คืนเดียว มีแรงไปทั้งอาทิตย์" },
      { en: "I'm happiest when the table keeps getting longer.", th: "ฉันมีความสุขที่สุดตอนโต๊ะต่อยาวขึ้นเรื่อย ๆ" },
      { en: "If there's music and a crowd, count me in.", th: "ถ้ามีเพลงและมีผู้คน นับฉันด้วย" },
      { en: "I'll happily start the conversation with a stranger.", th: "ฉันยินดีเป็นคนเริ่มคุยกับคนที่เพิ่งเจอ" },
    ],
    minus: [
      { en: "I recharge best with one or two people, not a crowd.", th: "ฉันชาร์จพลังได้ดีกับคนหนึ่งสองคน มากกว่าคนเยอะ ๆ" },
      { en: "A quiet table where I can hear everyone is my kind of night.", th: "โต๊ะเงียบ ๆ ที่ได้ยินทุกคนชัด คือคืนในแบบของฉัน" },
      { en: "One deep conversation beats ten small ones.", th: "คุยลึก ๆ เรื่องเดียว ดีกว่าคุยผิว ๆ สิบเรื่อง" },
      { en: "I'm at my best at a table of four or fewer.", th: "ฉันเป็นตัวเองที่สุดในโต๊ะไม่เกินสี่คน" },
      { en: "A quiet evening with a friend is a perfect evening.", th: "เย็นเงียบ ๆ กับเพื่อนสักคนคือเย็นที่สมบูรณ์แบบ" },
      { en: "I like getting to know people slowly.", th: "ฉันชอบค่อย ๆ ทำความรู้จักคน" },
    ],
  },
  explore: {
    plus: [
      { en: "If I've been somewhere before, I'd rather try somewhere new.", th: "ถ้าเคยไปแล้ว ฉันอยากลองที่ใหม่มากกว่า" },
      { en: "I'd cross the whole city for a place I've never been.", th: "ฉันยอมข้ามเมืองเพื่อไปที่ที่ไม่เคยไป" },
      { en: "A new soi is the best kind of weekend plan.", th: "ซอยใหม่ที่ยังไม่เคยเดิน คือแพลนวันหยุดที่ดีที่สุด" },
      { en: "I keep a list of places I haven't tried yet.", th: "ฉันมีลิสต์ที่ที่ยังไม่เคยไปเก็บไว้" },
      { en: "I'll order the dish I've never heard of.", th: "ฉันจะสั่งเมนูที่ไม่เคยได้ยินชื่อ" },
      { en: "Getting a little lost in Bangkok is part of the fun.", th: "หลงทางนิด ๆ ในกรุงเทพฯ คือส่วนหนึ่งของความสนุก" },
    ],
    minus: [
      { en: "A great regular spot beats a gamble on somewhere new.", th: "ร้านประจำดี ๆ ดีกว่าเสี่ยงลองร้านใหม่" },
      { en: "I like being a regular somewhere.", th: "ฉันชอบเป็นขาประจำของที่ไหนสักที่" },
      { en: "I know exactly where to get the best version of my favourite dish.", th: "ฉันรู้ว่าเมนูโปรดอร่อยที่สุดต้องไปร้านไหน" },
      { en: "Going back to a place I love never gets old.", th: "กลับไปที่ที่รักกี่ครั้งก็ไม่เบื่อ" },
      { en: "My favourite spots feel like a second living room.", th: "ที่ประจำของฉันเหมือนห้องนั่งเล่นที่สอง" },
      { en: "When friends visit, I take them to my tried and true places.", th: "เวลาเพื่อนมา ฉันพาไปร้านที่มั่นใจว่าดีแน่นอน" },
    ],
  },
  rhythm: {
    plus: [
      { en: "My best conversations happen after 10 pm.", th: "บทสนทนาที่ดีที่สุดของฉันเกิดหลังสี่ทุ่ม" },
      { en: "Bangkok only really wakes up after dark.", th: "กรุงเทพฯ เริ่มมีชีวิตจริง ๆ ก็ตอนมืดแล้ว" },
      { en: "My energy peaks when the sun goes down.", th: "พลังของฉันพุ่งสุดตอนพระอาทิตย์ตก" },
      { en: "A late dinner is my favourite kind of dinner.", th: "มื้อค่ำดึก ๆ คือมื้อค่ำที่ฉันชอบที่สุด" },
      { en: "I'd pick a night market over a morning market.", th: "ฉันเลือกตลาดกลางคืนมากกว่าตลาดเช้า" },
      { en: "Weekend mornings are for sleeping in.", th: "เช้าวันหยุดมีไว้นอนตื่นสาย" },
    ],
    minus: [
      { en: "I'd rather meet for breakfast than for a late drink.", th: "ฉันอยากนัดกินมื้อเช้ามากกว่านัดดึก" },
      { en: "My favourite Bangkok is the city before 9 am.", th: "กรุงเทพฯ ที่ฉันชอบที่สุดคือก่อนเก้าโมงเช้า" },
      { en: "I love the city when it's still cool and quiet.", th: "ฉันชอบเมืองตอนที่ยังเย็นและเงียบ" },
      { en: "An early start makes the whole day feel longer.", th: "ตื่นเช้าทำให้วันยาวขึ้น" },
      { en: "I'm usually home before the late crowd arrives.", th: "ฉันมักถึงบ้านก่อนคนกลางคืนจะออกมา" },
      { en: "Sunrise plans are worth the alarm.", th: "แพลนดูพระอาทิตย์ขึ้นคุ้มกับการตั้งนาฬิกาปลุก" },
    ],
  },
  motion: {
    plus: [
      { en: "I get to know people best while doing something together.", th: "ฉันรู้จักคนอื่นได้ดีที่สุดตอนทำกิจกรรมด้วยกัน" },
      { en: "A good day out leaves me a little sweaty.", th: "วันที่ดีคือวันที่ได้เหงื่อออกนิด ๆ" },
      { en: "I'd rather learn something hands-on than watch it.", th: "ฉันอยากลงมือทำมากกว่านั่งดู" },
      { en: "Walking is my favourite way to see Bangkok.", th: "การเดินคือวิธีเที่ยวกรุงเทพฯ ที่ฉันชอบที่สุด" },
      { en: "A game or a class is the easiest way for me to meet people.", th: "เกมหรือคลาสคือทางที่ง่ายที่สุดที่ฉันจะได้รู้จักคน" },
      { en: "I get restless if we sit in one place too long.", th: "ถ้านั่งที่เดิมนานเกินไป ฉันจะเริ่มอยู่ไม่สุข" },
    ],
    minus: [
      { en: "Give me a good seat and a long conversation.", th: "ขอที่นั่งดี ๆ กับบทสนทนายาว ๆ ก็พอ" },
      { en: "I'd rather taste ten things than walk ten kilometres.", th: "ขอชิมสิบอย่างดีกว่าเดินสิบกิโล" },
      { en: "The best part of a day out is the long sit-down meal.", th: "ช่วงที่ดีที่สุดของวันคือมื้อยาว ๆ ที่ได้นั่งกิน" },
      { en: "I like a place where I can stay for hours.", th: "ฉันชอบที่ที่นั่งได้เป็นชั่วโมง ๆ" },
      { en: "I enjoy watching and listening more than joining in.", th: "ฉันสนุกกับการดูและฟังมากกว่าลงไปเล่นเอง" },
      { en: "Good food and good talk is all the activity I need.", th: "อาหารดีกับบทสนทนาดี ๆ ก็เป็นกิจกรรมที่พอแล้ว" },
    ],
  },
  plan: {
    plus: [
      { en: "The best days out are the ones nobody planned.", th: "วันที่สนุกที่สุดคือวันที่ไม่มีใครวางแผน" },
      { en: "A last-minute message saying \"come now?\" makes my day.", th: "ข้อความชวนกะทันหันว่า \"มาตอนนี้เลยไหม?\" ทำให้ฉันดีใจ" },
      { en: "Some of my best memories started with \"why not?\"", th: "ความทรงจำดี ๆ หลายอย่างของฉันเริ่มจากคำว่า \"ไปก็ไป\"" },
      { en: "I like leaving room in the day for surprises.", th: "ฉันชอบเว้นที่ว่างในวันไว้ให้เรื่องเซอร์ไพรส์" },
      { en: "If a plan changes, I just roll with it.", th: "ถ้าแพลนเปลี่ยน ฉันก็ไปต่อได้สบาย ๆ" },
      { en: "I decide what I feel like doing on the day.", th: "ฉันตัดสินใจวันนั้นเลยว่าอยากทำอะไร" },
    ],
    minus: [
      { en: "I enjoy a day out more when I know the plan.", th: "ฉันสนุกกว่าเมื่อรู้แพลนล่วงหน้า" },
      { en: "I'm usually the one who makes the group plan.", th: "ฉันมักเป็นคนวางแผนให้กลุ่ม" },
      { en: "A good plan lets me relax and enjoy the day.", th: "แพลนที่ดีทำให้ฉันผ่อนคลายและสนุกกับวันได้เต็มที่" },
      { en: "I like knowing what time things start.", th: "ฉันชอบรู้ว่าอะไรเริ่มกี่โมง" },
      { en: "I book ahead so I don't have to think about it later.", th: "ฉันจองล่วงหน้าจะได้ไม่ต้องคิดทีหลัง" },
      { en: "I enjoy reading up on a place before I go.", th: "ฉันสนุกกับการหาข้อมูลก่อนไป" },
    ],
  },
  culture: {
    plus: [
      { en: "I'm always looking for Bangkok's newest creative spots.", th: "ฉันชอบตามหาที่ครีเอทีฟใหม่ ๆ ในกรุงเทพฯ" },
      { en: "Design weeks and gallery openings are my kind of festival.", th: "งานดีไซน์วีกและเปิดนิทรรศการคือเทศกาลของฉัน" },
      { en: "I love seeing what young Thai designers are making.", th: "ฉันชอบดูผลงานของนักออกแบบไทยรุ่นใหม่" },
      { en: "A new exhibition is a good enough reason to go out.", th: "นิทรรศการใหม่ก็เป็นเหตุผลพอที่จะออกจากบ้าน" },
      { en: "I follow small studios, gigs and pop-ups around the city.", th: "ฉันตามสตูดิโอเล็ก ๆ คอนเสิร์ต และป๊อปอัปทั่วเมือง" },
      { en: "I like places where someone is trying something new.", th: "ฉันชอบที่ที่มีคนกำลังลองทำอะไรใหม่ ๆ" },
    ],
    minus: [
      { en: "Old Bangkok neighbourhoods are where I feel most at home.", th: "ย่านเก่าของกรุงเทพฯ ทำให้ฉันรู้สึกเหมือนบ้าน" },
      { en: "I could spend a whole day in an old shophouse district.", th: "ฉันใช้เวลาทั้งวันในย่านตึกแถวเก่าได้" },
      { en: "I love hearing the story behind an old market.", th: "ฉันชอบฟังเรื่องราวเบื้องหลังตลาดเก่า" },
      { en: "Traditional Thai crafts are something I'd love to learn.", th: "งานหัตถศิลป์ไทยเป็นสิ่งที่ฉันอยากเรียน" },
      { en: "A shophouse street with a story beats a shiny new mall.", th: "ถนนตึกแถวที่มีเรื่องเล่า ชนะห้างใหม่เอี่ยม" },
      { en: "The old riverside communities are Bangkok at its best.", th: "ชุมชนริมน้ำเก่าแก่คือกรุงเทพฯ ในแบบที่ดีที่สุด" },
    ],
  },
};

/** Short end labels for a 0–100 slider ("A table of three ↔ A table of twenty"). */
export const SLIDER_ENDS: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [
      { en: "A table of twenty", th: "โต๊ะยี่สิบคน" },
      { en: "The liveliest room in the soi", th: "ห้องที่คึกคักที่สุดในซอย" },
      { en: "New people all night", th: "เจอคนใหม่ทั้งคืน" },
      { en: "A packed night market", th: "ตลาดกลางคืนคนแน่น" },
      { en: "A crowd singing along", th: "ผู้คนร้องเพลงตามกันทั้งงาน" },
      { en: "Everyone you know, all at once", th: "ทุกคนที่รู้จักมาพร้อมกัน" },
    ],
    minus: [
      { en: "A table of three", th: "โต๊ะสามคน" },
      { en: "A quiet corner", th: "มุมเงียบ ๆ" },
      { en: "One long conversation", th: "บทสนทนายาว ๆ เรื่องเดียว" },
      { en: "A calm park bench", th: "ม้านั่งในสวนเงียบ ๆ" },
      { en: "A small circle of old friends", th: "วงเล็ก ๆ ของเพื่อนเก่า" },
      { en: "A café where you can hear the rain", th: "คาเฟ่ที่ได้ยินเสียงฝน" },
    ],
  },
  explore: {
    plus: [
      { en: "Somewhere I've never been", th: "ที่ที่ไม่เคยไป" },
      { en: "A menu I can't read yet", th: "เมนูที่ยังอ่านไม่ออก" },
      { en: "A new soi every time", th: "ซอยใหม่ทุกครั้ง" },
      { en: "The opening everyone's talking about", th: "ร้านเปิดใหม่ที่ทุกคนพูดถึง" },
      { en: "A ferry stop I've never tried", th: "ท่าเรือที่ไม่เคยลอง" },
      { en: "A dish I can't name", th: "เมนูที่เรียกชื่อไม่ถูก" },
    ],
    minus: [
      { en: "My usual spot", th: "ที่ประจำ" },
      { en: "The order I always get", th: "เมนูเดิมที่สั่งทุกครั้ง" },
      { en: "The soi I know by heart", th: "ซอยที่รู้จักทุกซอก" },
      { en: "A place that knows my name", th: "ร้านที่จำชื่อฉันได้" },
      { en: "My favourite stall", th: "ร้านโปรดข้างทาง" },
      { en: "The same table as last time", th: "โต๊ะเดิมเหมือนครั้งก่อน" },
    ],
  },
  rhythm: {
    plus: [
      { en: "Out until 2 am", th: "อยู่ข้างนอกถึงตีสอง" },
      { en: "Dinner at 10 pm", th: "มื้อค่ำตอนสี่ทุ่ม" },
      { en: "The city after midnight", th: "เมืองหลังเที่ยงคืน" },
      { en: "A late movie", th: "หนังรอบดึก" },
      { en: "Night markets and neon", th: "ตลาดกลางคืนกับแสงนีออน" },
      { en: "Sleeping in on Sunday", th: "นอนตื่นสายวันอาทิตย์" },
    ],
    minus: [
      { en: "Up with the sunrise", th: "ตื่นพร้อมพระอาทิตย์" },
      { en: "Breakfast at 7", th: "มื้อเช้าเจ็ดโมง" },
      { en: "The city before 9 am", th: "เมืองก่อนเก้าโมงเช้า" },
      { en: "A dawn run", th: "วิ่งตอนรุ่งสาง" },
      { en: "Morning markets and mist", th: "ตลาดเช้ากับหมอกบาง ๆ" },
      { en: "Home by 10 pm", th: "ถึงบ้านก่อนสี่ทุ่ม" },
    ],
  },
  motion: {
    plus: [
      { en: "On my feet all day", th: "เดินทั้งวัน" },
      { en: "A bike and a map", th: "จักรยานกับแผนที่" },
      { en: "Learning a new move", th: "หัดท่าใหม่" },
      { en: "Ten kilometres of walking", th: "เดินสิบกิโล" },
      { en: "A game of pickup football", th: "เตะบอลขาจร" },
      { en: "Paddling a canal", th: "พายเรือในคลอง" },
    ],
    minus: [
      { en: "A good seat all afternoon", th: "ที่นั่งดี ๆ ทั้งบ่าย" },
      { en: "A long lunch", th: "มื้อกลางวันยาว ๆ" },
      { en: "One café, three hours", th: "คาเฟ่เดียว สามชั่วโมง" },
      { en: "A slow gallery", th: "แกลเลอรีที่เดินช้า ๆ" },
      { en: "Watching the river go by", th: "นั่งดูแม่น้ำไหลผ่าน" },
      { en: "A table full of small plates", th: "โต๊ะที่เต็มไปด้วยจานเล็ก ๆ" },
    ],
  },
  plan: {
    plus: [
      { en: "Decide on the day", th: "ตัดสินใจวันนั้นเลย" },
      { en: "Follow whatever looks good", th: "ไปตามสิ่งที่น่าสนใจ" },
      { en: "A message saying come now", th: "ข้อความชวนว่ามาตอนนี้เลย" },
      { en: "No plan at all", th: "ไม่มีแพลนเลย" },
      { en: "See where the boat goes", th: "ดูว่าเรือจะพาไปไหน" },
      { en: "Pick a stop at random", th: "สุ่มสถานีลง" },
    ],
    minus: [
      { en: "Booked a week ahead", th: "จองล่วงหน้าหนึ่งอาทิตย์" },
      { en: "A plan for every stop", th: "แพลนทุกจุดแวะ" },
      { en: "Reviews read in advance", th: "อ่านรีวิวไว้ก่อน" },
      { en: "A shared itinerary", th: "แผนเที่ยวที่แชร์กันแล้ว" },
      { en: "Tickets in hand", th: "ตั๋วอยู่ในมือแล้ว" },
      { en: "A backup plan too", th: "มีแผนสำรองด้วย" },
    ],
  },
  culture: {
    plus: [
      { en: "A new gallery opening", th: "งานเปิดแกลเลอรีใหม่" },
      { en: "A design market", th: "ตลาดงานดีไซน์" },
      { en: "An indie gig", th: "คอนเสิร์ตอินดี้" },
      { en: "Street art and zines", th: "สตรีทอาร์ตกับซีน" },
      { en: "A pop-up studio", th: "สตูดิโอป๊อปอัป" },
      { en: "A fresh light installation", th: "งานศิลปะจัดวางแสงไฟชิ้นใหม่" },
    ],
    minus: [
      { en: "An old shophouse street", th: "ถนนตึกแถวเก่า" },
      { en: "A century-old market", th: "ตลาดร้อยปี" },
      { en: "Thai classical music", th: "ดนตรีไทยเดิม" },
      { en: "A canal community", th: "ชุมชนริมคลอง" },
      { en: "A heritage walk", th: "เดินชมย่านเก่า" },
      { en: "A traditional craft workshop", th: "เวิร์กช็อปงานช่างไทย" },
    ],
  },
};

/**
 * "Which would bother you more?" Light, everyday annoyances. Each item is
 * filed under the pole of the person it would bother: too early bothers a
 * night owl, so "A 7 am meet-up" sits under rhythm +. Picking it scores that
 * pole (the text describes the other side, so the scoring is reversed).
 * Adapted from the old draft's "What bothers you more?" format.
 */
export const BOTHERS: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [
      { en: "A party that winds down at 9 pm", th: "ปาร์ตี้ที่เลิกตั้งแต่สามทุ่ม" },
      { en: "A dinner where only two people show up", th: "มื้อเย็นที่มากันแค่สองคน" },
      { en: "A festival with hardly anyone there", th: "เทศกาลที่แทบไม่มีคน" },
      { en: "A quiet table when you're in the mood to chat", th: "โต๊ะเงียบ ๆ ตอนที่อยากคุยเยอะ ๆ" },
      { en: "A group chat nobody replies to", th: "แชตกลุ่มที่ไม่มีใครตอบ" },
    ],
    minus: [
      { en: "A table so loud you can't hear your friend", th: "โต๊ะเสียงดังจนไม่ได้ยินเพื่อนพูด" },
      { en: "Being the only quiet one at a big party", th: "เป็นคนเดียวที่เงียบในปาร์ตี้ใหญ่" },
      { en: "A night with no moment to talk properly", th: "คืนที่ไม่มีจังหวะได้คุยกันจริง ๆ" },
      { en: "A plus-one who brings ten more people", th: "เพื่อนที่ชวนมาอีกสิบคน" },
      { en: "A packed market when you wanted a slow stroll", th: "ตลาดคนแน่นตอนที่อยากเดินเล่นสบาย ๆ" },
    ],
  },
  explore: {
    plus: [
      { en: "Ending up at the same place every weekend", th: "จบที่ร้านเดิมทุกวันหยุด" },
      { en: "Ordering the same dish again", th: "สั่งเมนูเดิมอีกแล้ว" },
      { en: "A trip where you only see what you've seen before", th: "ทริปที่เห็นแต่สิ่งที่เคยเห็น" },
      { en: "Never trying the soi next door", th: "ไม่เคยได้ลองซอยข้าง ๆ" },
      { en: "A favourite spot that never adds anything new", th: "ร้านโปรดที่ไม่เคยมีอะไรใหม่" },
    ],
    minus: [
      { en: "Your favourite café changing its whole menu", th: "คาเฟ่โปรดเปลี่ยนเมนูทั้งหมด" },
      { en: "A new place that turns out to be a miss", th: "ร้านใหม่ที่ไปแล้วไม่ปัง" },
      { en: "Your go-to stall moving across town", th: "ร้านประจำย้ายไปอีกฝั่งเมือง" },
      { en: "Trying three new places and loving none", th: "ลองร้านใหม่สามร้านแล้วไม่ถูกใจสักร้าน" },
      { en: "Getting lost on the way somewhere new", th: "หลงทางระหว่างไปที่ใหม่" },
    ],
  },
  rhythm: {
    plus: [
      { en: "A dinner that ends just as you're warming up", th: "มื้อค่ำที่เลิกตอนที่คุณเพิ่งเริ่มสนุก" },
      { en: "A 7 am meet-up", th: "นัดเจอเจ็ดโมงเช้า" },
      { en: "Leaving a great night early", th: "ต้องกลับก่อนตอนคืนกำลังสนุก" },
      { en: "A weekend with nothing open after dark", th: "วันหยุดที่ไม่มีอะไรเปิดหลังมืด" },
      { en: "An alarm on a Sunday", th: "นาฬิกาปลุกวันอาทิตย์" },
    ],
    minus: [
      { en: "Dinner plans that start at 10 pm", th: "นัดมื้อค่ำที่เริ่มสี่ทุ่ม" },
      { en: "Missing the cool morning air", th: "พลาดอากาศเย็น ๆ ตอนเช้า" },
      { en: "Sleeping through a whole weekend morning", th: "นอนเลยเช้าวันหยุดไปทั้งช่วง" },
      { en: "A night out that goes past 1 am", th: "การออกไปข้างนอกที่ลากยาวเกินตีหนึ่ง" },
      { en: "Reaching the morning market as it packs up", th: "ไปถึงตลาดเช้าตอนเขาเก็บร้าน" },
    ],
  },
  motion: {
    plus: [
      { en: "Sitting in one café all afternoon", th: "นั่งคาเฟ่เดียวทั้งบ่าย" },
      { en: "A day out with no walking at all", th: "เที่ยวทั้งวันโดยไม่ได้เดินเลย" },
      { en: "Watching a game you'd rather be playing", th: "นั่งดูเกมที่อยากลงไปเล่นเอง" },
      { en: "A class where you only take notes", th: "คลาสที่ได้แต่จดโน้ต" },
      { en: "A rainy day stuck indoors", th: "วันฝนตกที่ต้องอยู่แต่ในบ้าน" },
    ],
    minus: [
      { en: "Rushing through a great meal", th: "ต้องรีบกินมื้ออร่อย ๆ" },
      { en: "A tour that never stops long enough to sit", th: "ทัวร์ที่ไม่เคยหยุดนานพอให้นั่ง" },
      { en: "Being too out of breath to talk", th: "เหนื่อยจนพูดไม่ออก" },
      { en: "A gallery you have to see in ten minutes", th: "แกลเลอรีที่ต้องเดินจบในสิบนาที" },
      { en: "Skipping dessert to catch the next stop", th: "ข้ามของหวานเพื่อไปจุดต่อไป" },
    ],
  },
  plan: {
    plus: [
      { en: "A day planned to the minute", th: "วันที่วางแผนไว้ทุกนาที" },
      { en: "Booking a table three weeks ahead", th: "ต้องจองโต๊ะล่วงหน้าสามอาทิตย์" },
      { en: "Saying no to a fun last-minute invite", th: "ต้องปฏิเสธคำชวนกะทันหันที่น่าสนุก" },
      { en: "A long group chat to pick one restaurant", th: "แชตกลุ่มยาวเหยียดเพื่อเลือกร้านเดียว" },
      { en: "Skipping a great detour because it isn't on the plan", th: "ข้ามทางแวะดี ๆ เพราะไม่อยู่ในแพลน" },
    ],
    minus: [
      { en: "Arriving to find the place fully booked", th: "ไปถึงแล้วร้านเต็ม" },
      { en: "Nobody knowing where we're going next", th: "ไม่มีใครรู้ว่าจะไปไหนต่อ" },
      { en: "A plan that changes three times in one day", th: "แพลนเปลี่ยนสามรอบในวันเดียว" },
      { en: "Finding out the market closed an hour ago", th: "เพิ่งรู้ว่าตลาดปิดไปชั่วโมงหนึ่งแล้ว" },
      { en: "Not knowing how you'll get home", th: "ไม่รู้ว่าจะกลับบ้านยังไง" },
    ],
  },
  culture: {
    plus: [
      { en: "Missing the opening night of a new show", th: "พลาดคืนเปิดนิทรรศการใหม่" },
      { en: "A weekend with nothing new to see", th: "สุดสัปดาห์ที่ไม่มีอะไรใหม่ให้ดู" },
      { en: "Hearing about a great pop-up after it closed", th: "เพิ่งรู้เรื่องป๊อปอัปดี ๆ หลังมันปิดไปแล้ว" },
      { en: "A playlist of only old hits", th: "เพลย์ลิสต์ที่มีแต่เพลงเก่า" },
      { en: "Seeing the same museum display again", th: "ดูนิทรรศการชุดเดิมซ้ำอีกรอบ" },
    ],
    minus: [
      { en: "A food tour that skips the old family recipes", th: "ทัวร์อาหารที่ข้ามสูตรเก่าแก่ของครอบครัว" },
      { en: "Missing the last show of a folk performance", th: "พลาดรอบสุดท้ายของการแสดงพื้นบ้าน" },
      { en: "A trip with no time for the old town", th: "ทริปที่ไม่มีเวลาไปเมืองเก่า" },
      { en: "Never hearing the story behind a place", th: "ไม่ได้ฟังเรื่องราวเบื้องหลังสถานที่" },
      { en: "A craft fair with nothing handmade", th: "งานคราฟต์ที่ไม่มีของทำมือเลย" },
    ],
  },
};

/** "Pick your Bangkok superpower." Playful, from the old draft's playful section. */
export const SUPERPOWERS: Record<Category, { plus: Text[]; minus: Text[] }> = {
  energy: {
    plus: [
      { en: "Remember every name at a party of thirty", th: "จำชื่อทุกคนได้ในงานสามสิบคน" },
      { en: "Turn any table into the fun table", th: "ทำให้โต๊ะไหนก็กลายเป็นโต๊ะที่สนุกที่สุด" },
      { en: "Always know where tonight's crowd is", th: "รู้เสมอว่าคืนนี้ผู้คนไปรวมกันที่ไหน" },
    ],
    minus: [
      { en: "Find a quiet table anywhere, even Siam on a Saturday", th: "หาโต๊ะเงียบได้ทุกที่ แม้แต่สยามวันเสาร์" },
      { en: "Make any café feel like your living room", th: "ทำให้คาเฟ่ไหนก็เหมือนห้องนั่งเล่น" },
      { en: "Turn small talk into a real conversation", th: "เปลี่ยนคุยเล่นให้เป็นบทสนทนาจริง ๆ" },
    ],
  },
  explore: {
    plus: [
      { en: "Hear about every new opening a week early", th: "รู้เรื่องร้านเปิดใหม่ก่อนใครหนึ่งอาทิตย์" },
      { en: "Read any menu in any language", th: "อ่านเมนูได้ทุกภาษา" },
      { en: "Never get lost, however deep the soi", th: "ไม่หลงทาง ไม่ว่าซอยจะลึกแค่ไหน" },
    ],
    minus: [
      { en: "Your favourite stalls never close or move", th: "ร้านโปรดไม่เคยปิดหรือย้าย" },
      { en: "Always get your usual table", th: "ได้โต๊ะประจำทุกครั้ง" },
      { en: "Your go-to dish tastes perfect every time", th: "เมนูประจำอร่อยเป๊ะทุกครั้ง" },
    ],
  },
  rhythm: {
    plus: [
      { en: "Night markets that stay open until 3 am", th: "ตลาดกลางคืนเปิดถึงตีสาม" },
      { en: "Never feel tired the morning after", th: "ไม่เคยเพลียตอนเช้าหลังคืนสนุก" },
      { en: "A ride home that's always waiting", th: "มีรถกลับบ้านรออยู่เสมอ" },
    ],
    minus: [
      { en: "A cool 22 degree morning every day", th: "เช้าเย็นสบาย 22 องศาทุกวัน" },
      { en: "Wake up fresh without an alarm", th: "ตื่นสดชื่นโดยไม่ต้องตั้งนาฬิกา" },
      { en: "First in line at every morning market", th: "คิวแรกทุกตลาดเช้า" },
    ],
  },
  motion: {
    plus: [
      { en: "Never feel the heat on a long walk", th: "เดินไกลแค่ไหนก็ไม่ร้อน" },
      { en: "Pick up any sport in one afternoon", th: "เล่นกีฬาอะไรก็เป็นในบ่ายเดียว" },
      { en: "Legs that never get tired", th: "ขาที่ไม่มีวันล้า" },
    ],
    minus: [
      { en: "Always get the seat with the best view", th: "ได้ที่นั่งวิวดีที่สุดทุกครั้ง" },
      { en: "A meal that's never rushed", th: "มื้อที่ไม่ต้องรีบเลย" },
      { en: "Bottomless Thai tea, always the right sweetness", th: "ชาไทยไม่อั้น หวานพอดีทุกแก้ว" },
    ],
  },
  plan: {
    plus: [
      { en: "Every last-minute plan works out", th: "แพลนกะทันหันสำเร็จทุกครั้ง" },
      { en: "Always reach the pier just as the boat arrives", th: "ไปถึงท่าพอดีเรือมาทุกครั้ง" },
      { en: "Find something fun wherever you get off", th: "ลงตรงไหนก็เจอเรื่องสนุก" },
    ],
    minus: [
      { en: "Every booking works first try", th: "จองอะไรก็ได้ตั้งแต่ครั้งแรก" },
      { en: "Know the queue time before you leave home", th: "รู้เวลารอคิวก่อนออกจากบ้าน" },
      { en: "A plan that everyone actually follows", th: "แพลนที่ทุกคนทำตามจริง ๆ" },
    ],
  },
  culture: {
    plus: [
      { en: "A front-row pass to every opening and gig", th: "บัตรแถวหน้าทุกงานเปิดและคอนเสิร์ต" },
      { en: "Meet the artist at every exhibition", th: "ได้เจอศิลปินทุกนิทรรศการ" },
      { en: "Spot the next creative neighbourhood first", th: "เห็นย่านครีเอทีฟดาวรุ่งก่อนใคร" },
    ],
    minus: [
      { en: "A local storyteller in every old neighbourhood", th: "มีคนเล่าเรื่องท้องถิ่นในทุกย่านเก่า" },
      { en: "Master any Thai craft in a day", th: "ทำงานช่างไทยได้ทุกอย่างในวันเดียว" },
      { en: "Hear what an old street sounded like 100 years ago", th: "ได้ยินเสียงถนนเก่าเมื่อร้อยปีก่อน" },
    ],
  },
};
