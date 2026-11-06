/**
 * "Show the place on the widget" (owner card S4). On Me, only inside the Jurrgun phone app; the
 * choice stays on the phone (the app keeps it), so nothing here touches the server. Off by default.
 */
import { Script } from "./kit";
type T = (th: string, en: string) => string;

export function WidgetPlaceSwitch(props: { t: T }) {
  const { t } = props;
  return (
    <>
      <div class="push-switch" id="widget-place" hidden>
        <button type="button" class="qs" aria-pressed="false" aria-describedby="widget-place-hint">
          <span aria-hidden="true">📍</span>
          <span>
            <b>{t("แสดงชื่อสถานที่บนวิดเจ็ต", "Show the place on the widget")}</b>
            <small id="widget-place-hint">{t("ใครเห็นหน้าจอคุณก็เห็นด้วย", "Anyone who sees your screen sees it too")}</small>
          </span>
          <span class="sw" aria-hidden="true" />
        </button>
      </div>
      <Script dangerouslySetInnerHTML={{ __html: WIDGET_PLACE_JS }} />
    </>
  );
}

export const WIDGET_PLACE_JS = `(function(){var f=document.getElementById("widget-place");if(!f||!/JurrgunApp/.test(navigator.userAgent)||!window.ReactNativeWebView)return;
var b=f.querySelector("button"),on=false;
addEventListener("jurrgun-widget-place",function(e){var d=e.detail||{};f.hidden=false;b.disabled=false;on=!!d.on;b.setAttribute("aria-pressed",on?"true":"false")});
b.addEventListener("click",function(){b.disabled=true;window.ReactNativeWebView.postMessage(JSON.stringify({type:"jurrgun-widget-place",on:!on}))});
window.ReactNativeWebView.postMessage(JSON.stringify({type:"jurrgun-widget-place"}))})()`;
