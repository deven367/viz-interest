// Run with: node test.mjs. Executes the app with a minimal DOM/canvas recorder.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const elements = Object.fromEntries(
  ["chart", "form", "summary", "legend", "principal", "rates", "years", "compound", "rates-error"].map((id) => [id, {
    value: "", innerHTML: "", attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    setCustomValidity(message) { this.validationMessage = message; },
    addEventListener(type, handler) { this[type] = handler; },
  }])
);
let width = 341;
let labels = [];
let endpoints = [];
const ctx = {
  ...Object.fromEntries(["fillRect", "beginPath", "stroke", "setLineDash", "fill"].map((name) => [name, () => {}])),
  measureText(text) { return { width: text.length * parseFloat(this.font) * 0.6 }; },
  fillText(text, x, y) { labels.push({ text, x, y, align: this.textAlign }); },
};
for (const name of ["moveTo", "lineTo", "arc"]) {
  ctx[name] = (...args) => {
    assert(args.every(Number.isFinite), `${name} received nonfinite coordinates`);
    if (name === "arc") endpoints.push(args);
  };
}
elements.chart.getContext = () => ctx;
elements.chart.getBoundingClientRect = () => ({ width, height: width * 420 / 900 });
Object.assign(elements.principal, { value: "10000" });
Object.assign(elements.rates, { value: "10" });
Object.assign(elements.years, { value: "1" });
Object.assign(elements.compound, { value: "1" });
const window = { devicePixelRatio: 1, addEventListener() {} };
const document = { getElementById: (id) => elements[id], fonts: { ready: Promise.resolve() } };
const html = readFileSync(new URL("index.html", import.meta.url), "utf8");
runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { window, document, Intl });
await document.fonts.ready;

function render(inputs) {
  for (const [id, value] of Object.entries(inputs)) elements[id].value = value;
  labels = [];
  endpoints = [];
  elements.form.input();
}
function checkLayout() {
  const years = labels.filter((label) => label.align === "center");
  assert(years[0].x < years.at(-1).x, "Year axis must run left to right");
  for (const label of labels.filter((label) => label.align === "right")) {
    assert(label.x - ctx.measureText(label.text).width >= 0, "Currency label clipped at left edge");
    assert(label.x < elements.chart.width, "Currency label beyond right edge");
  }
}
function finalBalance() {
  return elements.summary.innerHTML.match(/class="value"[^>]*>([^<]+)/)[1];
}

assert.equal(finalBalance(), "$11,000");
render({ principal: "0", rates: "4, 6, 8", years: "20", compound: "12" });
assert.equal(finalBalance(), "$0");
assert.equal(endpoints[0][1], elements.chart.height - 40);
checkLayout();
for (const rates of ["6abc", "abc", "4, bad, 8", "", "-1", "101", "6,,8"]) {
  render({ rates });
  assert.equal(elements.rates.attributes["aria-invalid"], "true", rates);
  assert.equal(elements["rates-error"].hidden, false, rates);
  assert.equal(elements.summary.innerHTML, "", "Invalid inputs must not leave stale results");
  assert.equal(elements.legend.innerHTML, "");
}
render({ principal: "10000", rates: " 0%; .5; 100% ", years: "1" });
assert.equal(elements.rates.attributes["aria-invalid"], "false");
assert.equal(elements["rates-error"].hidden, true);
assert.equal(finalBalance(), "$10,000");
for (width of [288, 341, 918]) {
  for (window.devicePixelRatio of [1, 2]) {
    render({ principal: "100000", rates: "4, 6, 8", years: "20" });
    checkLayout();
    render({ principal: "1000000000000", rates: "0", years: "1" });
    checkLayout();
    assert.equal(finalBalance(), "$1,000,000,000,000");
    render({ principal: "10000", rates: "100", years: "80" });
    checkLayout();
    assert.match(finalBalance(), /^\$[\d,]+$/, "Summary must retain full currency amounts");
  }
}
console.log("Calculator regression checks passed.");
