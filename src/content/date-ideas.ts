/**
 * Pinky Plans date ideas (owner, 2026-10-26): real, public Bangkok places,
 * each with a hand-written reason to go and a good time of day, in a warm
 * voice. Not template lines and not a list of tags. Every place is public
 * and easy to leave, which is the point of a first date.
 *
 * `kind` uses the 💘 first-date preferences (content/dating.ts DATING_FIRST),
 * so ideas can be ranked by what both people already said (services/pinky-plans.ts).
 * The reason is never shown.
 *
 * Before launch, each place needs a real-place check (opening days, the pier,
 * whether it still runs). Bilingual, gender neutral, no em or en dashes.
 */
export type Text = { th: string; en: string };
const t = (en: string, th: string): Text => ({ en, th });

export type DateIdea = {
  key: string;
  /** A DATING_FIRST value: coffee | walk | street_food | museum | activity | market */
  kind: string;
  district: string;
  place: Text;
  when: Text;
  why: Text;
};

export const DATE_IDEAS: DateIdea[] = [
  {
    key: "lumphini_lake",
    kind: "walk",
    district: "pathum_wan",
    place: t("Lumphini Park", "สวนลุมพินี"),
    when: t("Late afternoon, as the heat breaks", "บ่ายแก่ ๆ ตอนแดดเริ่มอ่อน"),
    why: t(
      "Do one slow lap of the lake, then sit by the water and watch the monitor lizards mind their own business.",
      "เดินรอบบึงช้า ๆ สักรอบ แล้วนั่งริมน้ำดูตัวเงินตัวทองเดินผ่านไปแบบไม่สนใจใคร",
    ),
  },
  {
    key: "benjakitti_skywalk",
    kind: "walk",
    district: "khlong_toei",
    place: t("Benjakitti Forest Park", "สวนป่าเบญจกิติ"),
    when: t("Around 5 pm", "ราว ๆ ห้าโมงเย็น"),
    why: t(
      "The raised walkway is long enough to talk properly and green enough to forget the traffic for an hour.",
      "ทางเดินลอยฟ้ายาวพอให้คุยกันได้เต็มที่ และเขียวพอให้ลืมรถติดไปได้สักชั่วโมง",
    ),
  },
  {
    key: "bacc",
    kind: "museum",
    district: "pathum_wan",
    place: t("Bangkok Art and Culture Centre (BACC)", "หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)"),
    when: t("An afternoon, Tuesday to Sunday", "ช่วงบ่าย วันอังคารถึงอาทิตย์"),
    why: t(
      "Free, cool, and every floor gives you something to react to. If it goes well, there's coffee downstairs.",
      "เข้าฟรี เย็นสบาย และทุกชั้นมีงานให้ชวนกันคุยต่อ ถ้าคุยกันถูกคอ ชั้นล่างมีกาแฟรออยู่",
    ),
  },
  {
    key: "museum_siam",
    kind: "museum",
    district: "phra_nakhon",
    place: t("Museum Siam", "มิวเซียมสยาม"),
    when: t("A late morning", "ช่วงสาย ๆ"),
    why: t(
      "A museum you're meant to touch and play with, so laughing together comes easily. The river is a short walk away after.",
      "พิพิธภัณฑ์ที่ให้ลองจับลองเล่น หัวเราะด้วยกันได้ง่าย ออกมาแล้วเดินไปริมน้ำต่อได้ไม่ไกล",
    ),
  },
  {
    key: "talat_noi",
    kind: "coffee",
    district: "samphanthawong",
    place: t("Talat Noi", "ตลาดน้อย"),
    when: t("A weekend morning", "เช้าวันหยุด"),
    why: t(
      "Old shophouses, painted walls and riverside cafés hidden down the lanes. Get a little lost on purpose.",
      "ตึกแถวเก่า ผนังที่มีภาพวาด และคาเฟ่ริมน้ำที่ซ่อนอยู่ในซอย ลองหลงทางด้วยกันแบบตั้งใจ",
    ),
  },
  {
    key: "yaowarat_night",
    kind: "street_food",
    district: "samphanthawong",
    place: t("Yaowarat Road", "ถนนเยาวราช"),
    when: t("After dark", "หลังฟ้ามืด"),
    why: t(
      "Share three small dishes from three stalls instead of one big meal. Walking between them does half the talking for you.",
      "แบ่งกันกินสามร้านสามจานเล็ก แทนมื้อใหญ่มื้อเดียว เดินจากร้านไปร้าน แล้วเรื่องคุยจะมาเอง",
    ),
  },
  {
    key: "wang_lang",
    kind: "street_food",
    district: "bangkok_noi",
    place: t("Wang Lang Market", "ตลาดวังหลัง"),
    when: t("Lunchtime on a weekday", "มื้อกลางวันวันธรรมดา"),
    why: t(
      "Take the cross-river ferry from Tha Chang, snack your way through the market, and ferry back. The boat ride is half the date.",
      "นั่งเรือข้ามฟากจากท่าช้าง เดินกินไปเรื่อย ๆ ในตลาด แล้วนั่งเรือกลับ แค่นั่งเรือก็เป็นครึ่งหนึ่งของเดตแล้ว",
    ),
  },
  {
    key: "pak_khlong",
    kind: "market",
    district: "phra_nakhon",
    place: t("Pak Khlong Talat flower market", "ปากคลองตลาด"),
    when: t("Late evening", "ค่ำ ๆ"),
    why: t(
      "The flower market is busiest at night: bright, fragrant, and nobody minds if you only look. One small bunch is plenty.",
      "ตลาดดอกไม้คึกคักที่สุดตอนกลางคืน สีสด กลิ่นหอม เดินดูเฉย ๆ ก็ไม่มีใครว่า ดอกไม้กำเล็ก ๆ กำเดียวก็พอ",
    ),
  },
  {
    key: "express_boat",
    kind: "activity",
    district: "bang_rak",
    place: t("Chao Phraya Express Boat from Sathorn pier", "เรือด่วนเจ้าพระยา จากท่าสาทร"),
    when: t("Golden hour", "ช่วงแดดทองก่อนตะวันตก"),
    why: t(
      "Ride the orange-flag boat upriver for a few stops. It's cheap and breezy, and the city looks its best from the water.",
      "นั่งเรือธงส้มทวนน้ำขึ้นไปสักสองสามท่า ค่าเรือไม่แพง ลมเย็น และกรุงเทพฯ สวยที่สุดเมื่อมองจากแม่น้ำ",
    ),
  },
  {
    key: "santichai_sunset",
    kind: "walk",
    district: "phra_nakhon",
    place: t("Santichaiprakan Park, Phra Athit", "สวนสันติชัยปราการ ถนนพระอาทิตย์"),
    when: t("Sunset", "ตอนพระอาทิตย์ตก"),
    why: t(
      "Watch the sun go down behind Rama VIII Bridge from the lawn by the old fort, then wander Phra Athit Road while it's still warm.",
      "นั่งดูพระอาทิตย์ตกหลังสะพานพระราม 8 จากสนามหญ้าข้างป้อมพระสุเมรุ แล้วเดินเล่นถนนพระอาทิตย์ต่อตอนอากาศยังอุ่น ๆ",
    ),
  },
  {
    key: "ari_cafes",
    kind: "coffee",
    district: "phaya_thai",
    place: t("Ari", "อารีย์"),
    when: t("A weekend morning", "เช้าวันหยุด"),
    why: t(
      "Choose one small café. If the first coffee goes well, walk to a second one. If it doesn't, the BTS is right there.",
      "เลือกคาเฟ่เล็ก ๆ สักร้าน ถ้าแก้วแรกคุยกันถูกคอ ค่อยเดินไปร้านที่สอง ถ้าไม่ BTS ก็อยู่ใกล้ ๆ",
    ),
  },
  {
    key: "swan_boats",
    kind: "activity",
    district: "pathum_wan",
    place: t("Pedal boats on Lumphini lake", "เรือถีบในสวนลุมพินี"),
    when: t("A morning before it's hot", "ช่วงเช้าก่อนแดดแรง"),
    why: t(
      "Hard to take yourselves too seriously while pedalling a swan. Twenty minutes is enough, and then you've got a story.",
      "นั่งถีบเรือหงส์ด้วยกันแล้ว จะทำตัวขรึมก็ยาก ยี่สิบนาทีก็พอ แล้วจะมีเรื่องเล่าต่อ",
    ),
  },
  {
    key: "chula_park",
    kind: "walk",
    district: "pathum_wan",
    place: t("Chulalongkorn University Centenary Park", "อุทยาน 100 ปี จุฬาลงกรณ์มหาวิทยาลัย"),
    when: t("Early evening", "หัวค่ำ"),
    why: t(
      "A park built to catch the rain, with a gentle green slope to climb and the city all around you at the top.",
      "สวนที่ออกแบบมาให้รับน้ำฝน มีเนินหญ้าเขียว ๆ ให้เดินขึ้นไป แล้วเห็นเมืองรอบตัวจากข้างบน",
    ),
  },
  {
    key: "charoen_krung_galleries",
    kind: "museum",
    district: "bang_rak",
    place: t("Galleries along Charoen Krung", "แกลเลอรีย่านเจริญกรุง"),
    when: t("Late afternoon", "บ่ายแก่ ๆ"),
    why: t(
      "Small galleries along the old road, most of them free. Let whoever spots the strangest poster choose where you go in.",
      "แกลเลอรีเล็ก ๆ ตลอดถนนเก่า ส่วนใหญ่เข้าฟรี ใครเจอโปสเตอร์แปลกที่สุดก่อน คนนั้นได้เลือกว่าจะเข้าร้านไหน",
    ),
  },
  {
    key: "rot_fai_bikes",
    kind: "activity",
    district: "chatuchak",
    place: t("Bikes in Rot Fai Park", "ปั่นจักรยานในสวนรถไฟ"),
    when: t("Early morning", "เช้าตรู่"),
    why: t(
      "Rent bikes and ride the shady paths before the sun gets serious. It's easy to talk side by side.",
      "เช่าจักรยานปั่นไปตามทางร่ม ๆ ก่อนแดดเริ่มแรง ปั่นเคียงกันไปคุยกันไปได้สบาย",
    ),
  },
  {
    key: "nang_loeng",
    kind: "street_food",
    district: "pom_prap",
    place: t("Nang Loeng Market", "ตลาดนางเลิ้ง"),
    when: t("Lunch on a weekday", "มื้อกลางวันวันธรรมดา"),
    why: t(
      "One of the city's oldest markets, still full of old-style sweets. Go hungry and let the vendors choose for you.",
      "ตลาดเก่าแก่ที่สุดแห่งหนึ่งของเมือง ยังมีขนมแบบโบราณให้เลือกเพียบ ไปตอนท้องว่าง แล้วให้แม่ค้าช่วยเลือกให้",
    ),
  },
  {
    key: "chatuchak_gifts",
    kind: "market",
    district: "chatuchak",
    place: t("Chatuchak Weekend Market", "ตลาดนัดจตุจักร"),
    when: t("A Saturday morning", "เช้าวันเสาร์"),
    why: t(
      "Set a small budget each, split up for twenty minutes, and come back with one silly gift for each other.",
      "ตั้งงบคนละนิด แยกกันไปเดินยี่สิบนาที แล้วกลับมาพร้อมของขวัญขำ ๆ ให้กันคนละชิ้น",
    ),
  },
  {
    key: "wat_arun_early",
    kind: "walk",
    district: "bangkok_yai",
    place: t("Wat Arun riverside", "ริมน้ำวัดอรุณ"),
    when: t("Early morning, before the crowds", "เช้า ๆ ก่อนคนเยอะ"),
    why: t(
      "Cross on the ferry while it's quiet. The temple glows while the light is low, and you'll have the riverside nearly to yourselves.",
      "นั่งเรือข้ามไปตอนยังเงียบ ๆ วัดจะดูเรืองแสงตอนแดดยังอ่อน และริมน้ำแทบจะเป็นของคุณสองคน",
    ),
  },
];

export const ideaByKey = (key: string | null | undefined) => (key ? DATE_IDEAS.find((i) => i.key === key) : undefined);

/** Ideas shown together; a pair sees at most IDEAS_PER_DAY a day, and never a counter. */
export const IDEAS_AT_A_TIME = 3;
export const IDEAS_PER_DAY = 9;
