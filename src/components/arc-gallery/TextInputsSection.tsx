"use client";

import { useState } from "react";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { PasswordStrength } from "@/components/arc/password-strength/password-strength";
import { SearchField } from "@/components/arc/search-field/search-field";
import { InlineEdit } from "@/components/arc/inline-edit/inline-edit";
import { NumberField } from "@/components/arc/number-field/number-field";
import { PhoneInput } from "@/components/arc/phone-input/phone-input";
import { Select } from "@/components/arc/select/select";
import { Combobox } from "@/components/arc/combobox/combobox";
import { MultiSelect } from "@/components/arc/multi-select/multi-select";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { GalleryGroup, Specimen } from "./Specimen";

const BUYERS = [
  "Acme Industrial Sdn Bhd",
  "Meridian Chemicals",
  "Kelana Steel",
  "Tanjung Electrical",
  "Sunway Packaging",
];
const MARKETS = ["Malaysia", "Mydin", "Vietnam", "Indonesia"];
const BRANDS = ["Zen Garden", "MR. KING", "L.HANDS"];
const CATEGORIES = [
  "Shower cream & gel",
  "Hand wash & soap",
  "Dishwash & cleanser",
];
const STATUSES = [
  "All",
  "Confirmed",
  "Extracting",
  "Failed",
  "From the shop",
];

const asOptions = (values: string[]) =>
  values.map((value) => ({ value, label: value }));

const BUYER_OPTIONS = BUYERS.map((name) => ({
  value: name,
  label: name,
  keywords: name.split(" "),
}));
const PRODUCT_OPTIONS = [
  {
    value: "ZEN-SC-2100-GM-VN",
    label: "ZEN 2.1L — Goat's Milk",
    keywords: ["ZEN-SC-2100-GM-VN", "Vietnam"],
  },
  {
    value: "MRK-DW-1500-LE-MY",
    label: "MR.KING 1.5L — Lemon",
    keywords: ["MRK-DW-1500-LE-MY", "Malaysia"],
  },
];

const stack = "flex min-w-0 flex-col gap-md";
const note = "text-[length:var(--text-body-sm)] text-ink-secondary";

function InputSpecimen() {
  const [poNumber, setPoNumber] = useState("ACME-PO-771");
  const [email, setEmail] = useState("orders-at-kelana");
  const invalid = !email.includes("@");
  return (
    <Specimen
      name="input"
      job="Every text field: PO number, buyer name, email."
      phase={3}
    >
      <div className={stack}>
        <Input
          label="PO number"
          value={poNumber}
          onChange={(event) => setPoNumber(event.target.value)}
        />
        <Input
          label="Buyer name"
          description="As it is printed on the purchase order."
          defaultValue="Meridian Chemicals"
        />
        <Input
          label="Contact email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={invalid ? "Enter a valid email address." : undefined}
        />
      </div>
    </Specimen>
  );
}

function TextareaSpecimen() {
  const [reason, setReason] = useState("Buyer asked to push it a week.");
  return (
    <Specimen
      name="textarea"
      job="Remark, notes, and the reason a delivery date moved."
      phase={3}
    >
      <div className={stack}>
        <Textarea
          label="Why is the expected delivery moving?"
          description="Recorded with this change, beside the old and new dates."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Textarea
          label="Remark"
          defaultValue=""
          error="Say why the expected delivery date is moving."
        />
      </div>
    </Specimen>
  );
}

function PasswordFieldSpecimen() {
  const [password, setPassword] = useState("");
  return (
    <Specimen
      name="password-field"
      job="Sign in, reset and change password."
      phase={6}
    >
      <PasswordField
        label="Password"
        description="The one you set when you were invited."
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
    </Specimen>
  );
}

function PasswordStrengthSpecimen() {
  const [password, setPassword] = useState("Zen");
  return (
    <Specimen
      name="password-strength"
      job="Setting a new password."
      phase={6}
    >
      <PasswordStrength
        label="New password"
        autoComplete="new-password"
        value={password}
        onValueChange={(next) => setPassword(next)}
      />
    </Specimen>
  );
}

function SearchFieldSpecimen() {
  const [query, setQuery] = useState("Meridian");
  const matches = BUYERS.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Specimen
      name="search-field"
      job="Table searches and the Demand Board search."
      phase={2}
    >
      <div className="flex min-w-0 flex-col gap-sm">
        <SearchField
          label="Search buyers"
          placeholder="Buyer, PO number or SKU"
          value={query}
          onValueChange={setQuery}
        />
        <p className={note}>
          {matches.length === 0
            ? "Nothing matches that."
            : `${matches.length} of ${BUYERS.length} buyers: ${matches.join(", ")}`}
        </p>
      </div>
    </Specimen>
  );
}

function InlineEditSpecimen() {
  const [market, setMarket] = useState("Vietnam");
  const [family, setFamily] = useState("Zen Garden Shower Cream 2.1L");
  const save = (apply: (next: string) => void) => (next: string) =>
    new Promise<void>((resolve) =>
      setTimeout(() => {
        apply(next);
        resolve();
      }, 600),
    );
  return (
    <Specimen
      name="inline-edit"
      job="Rename a catalogue value or a family in place."
      phase={6}
    >
      <div className={stack}>
        <InlineEdit
          label="Market name"
          value={market}
          onSave={save(setMarket)}
          validate={(next) =>
            next.trim() === ""
              ? "A market needs a name."
              : MARKETS.some(
                    (m) =>
                      m !== market &&
                      m.toLowerCase() === next.trim().toLowerCase(),
                  )
                ? `There is already a market called “${next.trim()}”.`
                : null
          }
        />
        <InlineEdit
          label="Family name"
          variant="body"
          as="p"
          value={family}
          onSave={save(setFamily)}
        />
      </div>
    </Specimen>
  );
}

function NumberFieldSpecimen() {
  const [cartons, setCartons] = useState(4);
  const [terms, setTerms] = useState(30);
  return (
    <Specimen
      name="number-field"
      job="Carton counts and payment terms in days."
      phase={5}
    >
      <div className={stack}>
        <NumberField
          label="Cartons"
          description="Whole cartons, up to 9,999."
          value={cartons}
          onValueChange={setCartons}
          min={1}
          max={9999}
          suffix={(n) => (n === 1 ? " carton" : " cartons")}
        />
        <NumberField
          label="Payment terms"
          value={terms}
          onValueChange={setTerms}
          min={0}
          max={365}
          step={1}
          largeStep={15}
          suffix=" days"
        />
      </div>
    </Specimen>
  );
}

function PhoneInputSpecimen() {
  const [phone, setPhone] = useState("");
  return (
    <Specimen
      name="phone-input"
      job="Buyer and contact phone numbers, Malaysia first."
      phase={4}
    >
      <div className="flex min-w-0 flex-col gap-sm">
        <PhoneInput
          label="Contact phone"
          value={phone}
          onValueChange={(next) => setPhone(next)}
          defaultCountry="SG"
          preferredCountries={["SG", "ID", "VN", "TH"]}
        />
        <p className={note}>
          Arc&apos;s country list has no Malaysia (+60) yet, so this previews
          with Singapore first.
        </p>
      </div>
    </Specimen>
  );
}

function SelectSpecimen() {
  const [market, setMarket] = useState("Mydin");
  const [brand, setBrand] = useState("");
  return (
    <Specimen
      name="select"
      job="Market, brand and category filters."
      phase={4}
    >
      <div className={stack}>
        <Select
          label="Market"
          options={asOptions(MARKETS)}
          value={market}
          onValueChange={setMarket}
        />
        <Select
          label="Brand"
          placeholder="All brands"
          options={asOptions(BRANDS)}
          value={brand}
          onValueChange={setBrand}
        />
        <Select
          label="Category"
          description="Filters the product list."
          placeholder="All categories"
          options={asOptions(CATEGORIES)}
        />
      </div>
    </Specimen>
  );
}

function ComboboxSpecimen() {
  const [buyer, setBuyer] = useState("Kelana Steel");
  const [product, setProduct] = useState("");
  return (
    <Specimen
      name="combobox"
      job="Buyer and product pickers on the review screen."
      phase={3}
    >
      <div className={stack}>
        <Combobox
          label="Buyer"
          options={BUYER_OPTIONS}
          value={buyer}
          onValueChange={setBuyer}
          placeholder="Search buyers"
          emptyMessage="No buyer by that name."
        />
        <Combobox
          label="Product"
          description="Search by name or SKU."
          options={PRODUCT_OPTIONS}
          value={product}
          onValueChange={setProduct}
          placeholder="ZEN-SC-2100-GM-VN"
          emptyMessage="No product matches."
        />
      </div>
    </Specimen>
  );
}

function MultiSelectSpecimen() {
  const [markets, setMarkets] = useState(["Malaysia", "Vietnam"]);
  const [buyers, setBuyers] = useState<string[]>([]);
  return (
    <Specimen
      name="multi-select"
      job="Trend series pickers: markets, buyers, products."
      phase={2}
    >
      <div className={stack}>
        <MultiSelect
          label="Markets on the chart"
          options={asOptions(MARKETS)}
          value={markets}
          onValueChange={setMarkets}
          placeholder="Choose markets"
        />
        <MultiSelect
          label="Buyers on the chart"
          description="Up to six at a time."
          options={asOptions(BUYERS)}
          value={buyers}
          onValueChange={setBuyers}
          placeholder="Choose buyers"
        />
      </div>
    </Specimen>
  );
}

function ChipGroupSpecimen() {
  const [status, setStatus] = useState(["All"]);
  const [flags, setFlags] = useState(["Missing image"]);
  return (
    <Specimen
      name="chip-group"
      job="Status and attention chips over list pages."
      phase={3}
    >
      <div className={stack}>
        <ChipGroup
          label="Status"
          multiple={false}
          options={asOptions(STATUSES)}
          value={status}
          onValueChange={(next) => setStatus(next.length ? next : ["All"])}
        />
        <ChipGroup
          label="Needs attention"
          options={asOptions([
            "Missing image",
            "Unpublished",
            "Low stock",
            "Not sold 60d",
            "Needs review",
          ])}
          value={flags}
          onValueChange={setFlags}
          maxVisible={3}
        />
      </div>
    </Specimen>
  );
}

export function TextInputsSection() {
  return (
    <GalleryGroup id="text-inputs" title="Text and choice inputs">
      <InputSpecimen />
      <TextareaSpecimen />
      <PasswordFieldSpecimen />
      <PasswordStrengthSpecimen />
      <SearchFieldSpecimen />
      <InlineEditSpecimen />
      <NumberFieldSpecimen />
      <PhoneInputSpecimen />
      <SelectSpecimen />
      <ComboboxSpecimen />
      <MultiSelectSpecimen />
      <ChipGroupSpecimen />
    </GalleryGroup>
  );
}
