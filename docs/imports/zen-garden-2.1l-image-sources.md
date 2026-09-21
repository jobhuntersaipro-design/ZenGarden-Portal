# Photographs for the 2.1L shower cream, three blocks

Companion to `zen-garden-2026-09-21-three-blocks.labels.json`. Drop the files
this names into one folder and run:

```
npx tsx --env-file=.env.local scripts/import-product-images.ts <folder> --dry-run
```

## Eight photographs, twenty products

Super Indo, Lotus's and NORMAL/DIY are the same bottle sold to different
customers, so one photograph per flavour serves all three blocks. The image
importer matches on the file's basename, so each photograph is saved once per
SKU that shows it.

| Flavour | File names (one photograph, copied) |
| --- | --- |
| Goat's Milk | `ZEN-SC-2100-GM.jpg`, `ZEN-SC-2100-GM-ID.jpg`, `ZEN-SC-2100-GM-LOTUS.jpg` |
| Lavender | `ZEN-SC-2100-LV.jpg`, `ZEN-SC-2100-LV-ID.jpg`, `ZEN-SC-2100-LV-LOTUS.jpg` |
| Papaya | `ZEN-SC-2100-PP.jpg`, `ZEN-SC-2100-PP-ID.jpg`, `ZEN-SC-2100-PP-LOTUS.jpg` |
| Royal Jelly | `ZEN-SC-2100-RJ.jpg`, `ZEN-SC-2100-RJ-ID.jpg`, `ZEN-SC-2100-RJ-LOTUS.jpg` |
| Green Tea | `ZEN-SC-2100-GT.jpg`, `ZEN-SC-2100-GT-ID.jpg`, `ZEN-SC-2100-GT-LOTUS.jpg` |
| Carrot | `ZEN-SC-2100-CR.jpg`, `ZEN-SC-2100-CR-ID.jpg`, `ZEN-SC-2100-CR-LOTUS.jpg` |
| Avocado | `ZEN-SC-2100-AV.jpg` |
| Oat Milk | `ZEN-SC-2100-OM.jpg` |

`scripts/fan-out-variant-images.ts` does the copying: name one file per flavour
(`goats-milk.jpg`, `lavender.jpg`, …) and it writes the twenty SKU-named files.

## Where the photographs are

**Nothing here was downloaded, and no page below was opened.** This container's
egress proxy refuses every host outside the package registries, so both `curl`
and the fetch tool answered `EGRESS_BLOCKED` on each of these. The list is what
a web search returned — titles and URLs — and it is a starting point for a
person with a browser, not a verified match.

**Read each photograph before you save it under a SKU.** The image importer
refuses to fuzzy-match a file to a product for the reason that applies here
too: a photograph on the wrong product is a mispriced order nobody can see.
Check the flavour *and* the size — most of these retailers sell the same
flavour in 1L, and the 1L bottle is a different shape.

### The customer's own site — try this first

<https://www.lovinghands.my/products/> lists Zen Garden's own range. Its
photographs are the ones to prefer: they are the right brand's own, they need
nobody's permission, and they will match the bottle the customer actually
ships. Everything below is a fallback.

### Retailers, by flavour

| Flavour | Pages a search returned |
| --- | --- |
| Goat's Milk | `sunwaymulticare.com.my/products/zen-garden-shower-cream-2-1-liter-goat-milk` · `aapharmacy.com.my/products/zen-garden-shower-cream-goats-milk-2-1l` · `mrdiy.com.my/products/zen-shower-cream-goat-milk-2-1l-9751703-001001` |
| Lavender | `sunwaymulticare.com.my/products/zen-garden-shower-cream-2-1-liter-lavender` · `savershall.com/product/zen-garden-lavender-chamomile-shower-cream-2100ml/1` · `soonfattbro.com/zen-garden-shower-cream-lavender-2100ml` |
| Papaya | `aapharmacy.com.my/products/zen-garden-shower-cream-papaya-2-1l` · `pjgrocer.com` (Papaya 2100ML) · `mastermacfood.com` (Lightening Papaya 2100ML) |
| Royal Jelly | `aapharmacy.com.my/products/zen-garden-shower-cream-royal-jelly-and-vitamin-e-2-1l` · `mrdiy.com.my/products/zen-shower-cream-royal-jelly-2-1l-9751705-001001` · `haniffaonline.com.my/products/zen-shower-cream-royal-jelly-2-1l` |
| Green Tea | `luluhypermarket.com/en-my/zen-garden-shower-cream-green-tea-2-1litre/p/675707` · `mastermacfood.com` (Green Tea & Aloe Vera 2100ML) |
| Carrot | `cellsii.com/zen-garden-lightening-carrot-deep-moisturising-shower-cream-2100ml/` · `mastermacfood.com` (Lightening Carrot 2100ML) |
| Avocado | **Nothing found at 2.1L.** |
| Oat Milk | **Nothing found at 2.1L.** |

Avocado and Oat Milk appear in the master list's NORMAL/DIY block and in no
public 2.1L listing a search could find. They are likely newer than the
retailers' pages, so the photographs will have to come from the customer.

## What the shop needs beyond a photograph

A product shows in the shop only when it is active, off *Needs review*, and
carries a list price above zero. Every product the master list imported landed
at `0.00` with `needsReview: true` on purpose — the sheet carries no prices —
so these twenty will stay invisible to buyers until someone prices them, with
or without their photographs.
