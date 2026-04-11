import test from "node:test";
import assert from "node:assert/strict";

import { parseSearchRows } from "../src/lib/providers/steamStoreSearchProvider.js";

const SEARCH_RESULTS_HTML = `
  <a href="https://store.steampowered.com/app/599140/Graveyard_Keeper/?snr=1_7_7_2300_150_1"
     class="search_result_row ds_collapse_flag"
     data-price-final="0">
    <div class="responsive_search_name_combined">
      <div class="search_name ellipsis">
        <span class="title">Graveyard Keeper</span>
      </div>
      <div class="search_price_discount_combined responsive_secondrow" data-price-final="0">
        <div class="search_discount_and_price responsive_secondrow">
          <div class="discount_block search_discount_block"
               data-price-final="0"
               data-discount="100"
               role="link"
               aria-label="100% off. $19.99 normally, discounted to $0.00">
            <div class="discount_pct">-100%</div>
            <div class="discount_prices">
              <div class="discount_original_price">$19.99</div>
              <div class="discount_final_price">$0.00</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a>
  <a href="https://store.steampowered.com/app/3027490/LivingForest/?snr=1_7_7_2300_150_1"
     class="search_result_row ds_collapse_flag"
     data-price-final="0">
    <div class="responsive_search_name_combined">
      <div class="search_name ellipsis">
        <span class="title">LivingForest</span>
      </div>
      <div class="search_price_discount_combined responsive_secondrow" data-price-final="0">
        <div class="search_discount_and_price responsive_secondrow">
          <div class="discount_block search_discount_block"
               data-price-final="0"
               data-discount="100"
               role="link"
               aria-label="100% off. $15.99 normally, discounted to $0.00">
            <div class="discount_pct">-100%</div>
            <div class="discount_prices">
              <div class="discount_original_price">$15.99</div>
              <div class="discount_final_price">$0.00</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a>
`;

const NON_FREE_SPECIALS_HTML = `
  <a href="https://store.steampowered.com/app/123456/NotFreeGame/"
     class="search_result_row ds_collapse_flag"
     data-price-final="999">
    <div class="responsive_search_name_combined">
      <div class="search_name ellipsis">
        <span class="title">Not Free Game</span>
      </div>
      <div class="search_price_discount_combined responsive_secondrow" data-price-final="999">
        <div class="search_discount_and_price responsive_secondrow">
          <div class="discount_block search_discount_block"
               data-price-final="999"
               data-discount="50"
               role="link">
            <div class="discount_pct">-50%</div>
            <div class="discount_prices">
              <div class="discount_original_price">$19.98</div>
              <div class="discount_final_price">$9.99</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a>
`;

test("parseSearchRows detects active free-to-keep rows discounted to zero", () => {
  const promotions = parseSearchRows(SEARCH_RESULTS_HTML);

  assert.equal(promotions.length, 2);
  assert.deepEqual(
    promotions.map((promotion) => promotion.appId),
    [599140, 3027490]
  );
  assert.ok(promotions.every((promotion) => promotion.promoType === "free-to-keep"));
});

test("parseSearchRows ignores specials that are not actually free", () => {
  const promotions = parseSearchRows(NON_FREE_SPECIALS_HTML);

  assert.equal(promotions.length, 0);
});
