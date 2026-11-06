/* 日历标记 前端逻辑：日历 + 农历 + 标记(✕) + 累计标记 + 多设备共享标记数据 */
(function () {
  "use strict";
  /* 统一网关前缀适配：经网关访问时接口走 /app/calendar，本地直连走相对根 */
  var API_BASE = window.location.pathname.indexOf("/app/calendar") === 0 ? "/app/calendar" : "";
  /* 脚本错误可见化：避免页面停留在"加载中"而无提示 */
  window.onerror = function (msg) {
    try { document.getElementById("todayInfo").textContent = "脚本错误: " + msg; } catch (e) { /* ignore */ }
  };
  /* ================= 农历算法（1900-2100 标准数据表） ================= */
  var lunarInfo = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  var lunarMonthName = ["正","二","三","四","五","六","七","八","九","十","冬","腊"];
  var lunarDayName = [
    "初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
    "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
    "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"
  ];
  function lYearDays(y) {
    var i, sum = 348;
    for (i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    return sum + leapDays(y);
  }
  function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
  function leapDays(y) { return leapMonth(y) ? ((lunarInfo[y - 1900] & 0x10000) ? 30 : 29) : 0; }
  function monthDays(y, m) { return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
  /* 公历 -> 农历，返回 {year, month, day, isLeap} */
  function solarToLunar(y, m, d) {
    var offset = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    var i, temp = 0, lunarY;
    for (i = 1900; i < 2101 && offset > 0; i++) {
      temp = lYearDays(i);
      offset -= temp;
    }
    if (offset < 0) { offset += temp; i--; }
    lunarY = i;
    var isLeap = false, leap = leapMonth(lunarY);
    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) {
        --i; isLeap = true; temp = leapDays(lunarY);
      } else {
        temp = monthDays(lunarY, i);
      }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) { isLeap = false; } else { isLeap = true; }
    }
    if (offset < 0) { offset += temp; i--; }
    var lunarM = i, lunarD = offset + 1;
    return { year: lunarY, month: lunarM, day: lunarD, isLeap: isLeap };
  }
  function lunarText(y, m, d) {
    var l = solarToLunar(y, m, d);
    if (!(l.day >= 1 && l.day <= 30) || !(l.month >= 1 && l.month <= 12)) return "";
    var leapStr = l.isLeap ? "闰" : "";
    if (l.day === 1) {
      return leapStr + "农历" + lunarMonthName[l.month - 1] + "月";
    }
    return leapStr + lunarDayName[l.day - 1];
  }
  /* ================= 状态 ================= */
  var marks = {};           // { "YYYY-MM-DD": {t} } 所有设备共享同一份
  var viewYear, viewMonth;  // 当前展示的年月
  var version = 0;
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateKey(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function todayKey() { var t = new Date(); return dateKey(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  /* ================= 渲染 ================= */
  var grid = document.getElementById("grid");
  var monthTitle = document.getElementById("monthTitle");
  var todayInfo = document.getElementById("todayInfo");
  var statTotal = document.getElementById("statTotal");
  var statMonth = document.getElementById("statMonth");
  var markList = document.getElementById("markList");
  function render() {
    monthTitle.textContent = viewYear + " 年 " + viewMonth + " 月";
    var first = new Date(viewYear, viewMonth - 1, 1);
    var daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    var startWeek = (first.getDay() + 6) % 7; // 周一为第一列
    var tKey = todayKey();
    var html = "";
    var i;
    for (i = 0; i < startWeek; i++) html += '<div class="cell blank"></div>';
    for (i = 1; i <= daysInMonth; i++) {
      var key = dateKey(viewYear, viewMonth, i);
      var cls = "cell";
      if (key === tKey) cls += " today";
      if (marks[key]) cls += " marked";
      html += '<div class="' + cls + '" data-date="' + key + '">' +
        '<span class="day">' + i + "</span>" +
        '<span class="lunar">' + lunarText(viewYear, viewMonth, i) + "</span>" +
        (marks[key] ? '<span class="xmark">✕</span>' : "") +
        "</div>";
    }
    grid.innerHTML = html;
    /* 统计：累计标记 + 本月标记 */
    var keys = Object.keys(marks);
    statTotal.textContent = keys.length;
    var monthCount = 0;
    keys.forEach(function (k) {
      if (k.indexOf(viewYear + "-" + pad(viewMonth)) === 0) monthCount++;
    });
    statMonth.textContent = monthCount;
    /* 累计标记明细（按月倒序、日期倒序） */
    keys.sort().reverse();
    if (!keys.length) {
      markList.innerHTML = '<div class="empty">还没有标记，点击上方日期开始记录吧～</div>';
    } else {
      var byMonth = {};
      keys.forEach(function (k) {
        var mk = k.slice(0, 7);
        (byMonth[mk] = byMonth[mk] || []).push(k);
      });
      var out = "";
      Object.keys(byMonth).sort().reverse().forEach(function (mk) {
        out += '<div class="mark-item"><span class="m">' + mk.replace("-", " 年 ") + ' 月</span><span class="m">共 ' + byMonth[mk].length + " 天</span></div>";
        byMonth[mk].forEach(function (k) {
          var p = k.split("-");
          out += '<div class="mark-item"><span class="d">✕ ' + k + "</span><span class=\"m\">" +
            lunarText(+p[0], +p[1], +p[2]) + " · 周" + "日一二三四五六".charAt(new Date(+p[0], +p[1] - 1, +p[2]).getDay()) + "</span></div>";
        });
      });
      markList.innerHTML = out;
    }
  }
  /* 顶部今日信息（含农历） */
  function renderToday() {
    var t = new Date();
    var week = "日一二三四五六".charAt(t.getDay());
    todayInfo.textContent = t.getFullYear() + "年" + (t.getMonth() + 1) + "月" + t.getDate() +
      "日 周" + week + " · 农历" + lunarText(t.getFullYear(), t.getMonth() + 1, t.getDate()).replace("农历", " ");
  }
  /* ================= 数据同步（多设备共享同一份） ================= */
  function loadMarks() {
    return fetch(API_BASE + "/api/marks", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        marks = data.marks || {};
        version = data.version || 0;
        render();
      })
      .catch(function () {
        todayInfo.textContent = "连接服务器失败，正在重试…";
      });
  }
  function toggleMark(key) {
    fetch(API_BASE + "/api/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: key }),
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        marks = data.marks || {};
        version = data.version || 0;
        render();
      })
      .catch(function (e) { alert("操作失败：" + e.message); });
  }
  /* ================= 事件 ================= */
  grid.addEventListener("click", function (ev) {
    var cell = ev.target.closest(".cell");
    if (!cell || cell.classList.contains("blank")) return;
    toggleMark(cell.getAttribute("data-date"));
  });
  document.getElementById("prevBtn").addEventListener("click", function () {
    viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; } render();
  });
  document.getElementById("nextBtn").addEventListener("click", function () {
    viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; } render();
  });
  document.getElementById("todayBtn").addEventListener("click", function () {
    var t = new Date(); viewYear = t.getFullYear(); viewMonth = t.getMonth() + 1; render();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadMarks(); // 切回页面时同步最新数据
  });
  /* ================= 启动 ================= */
  var now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth() + 1;
  renderToday();
  render();
  loadMarks();
  setInterval(loadMarks, 5000); // 每5秒轮询，保证多设备数据一致
})();