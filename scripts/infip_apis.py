"""
Infip API Key Extractor (Chrome / Undetected Chromedriver)
Strategy:
  1. Open infip.pro/api-keys in a real Chrome window
  2. Wait for Cloudflare to pass (you may need to click the checkbox manually)
  3. Dismiss the "Join Community" popup if it appears
  4. Try to generate new keys by clicking "Generate New Key"
  5. Also reads any existing keys from the page's localStorage
  6. Saves all unique keys to keys.json
"""

import sys
import io
import time
import json
import os
import traceback
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Fix Unicode encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# --- Configuration ---
KEYS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "keys.json")
TARGET_URL = "https://infip.pro/api-keys"
TARGET_KEYS = 5           # Number of NEW keys to try to generate (1 per browser session)
HEADLESS = False          # Must be False - Cloudflare blocks headless browsers

def load_api_keys():
    if os.path.exists(KEYS_FILE):
        try:
            with open(KEYS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('api_keys', [])
        except Exception as e:
            print(f"[!] Error loading keys: {e}")
    return []


def save_api_keys(api_keys):
    try:
        with open(KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump({'api_keys': api_keys}, f, indent=2, ensure_ascii=False)
        print(f"  [SAVED] {len(api_keys)} key(s) in {KEYS_FILE}")
    except Exception as e:
        print(f"[!] Error saving keys: {e}")


def wait_for_cloudflare(driver, timeout=120):
    """
    Waits for Cloudflare challenge to pass.
    The user may need to manually click the CAPTCHA checkbox.
    """
    print("  [INFO] Waiting for Cloudflare verification...")
    print("  [ACTION] If you see a 'Verify you are human' checkbox, please click it!")
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        page_src = driver.page_source.lower()
        if any(kw in page_src for kw in ['challenge-running', 'cf-turnstile', 'just a moment']):
            time.sleep(2)
        else:
            print("  ✓ Cloudflare passed or no challenge detected.")
            time.sleep(2)
            return True

    print("  [!] Cloudflare timed out after 120 seconds.")
    return False


def read_keys_from_localstorage(driver):
    """Extract all infip keys stored in the browser's localStorage."""
    try:
        # Keys are stored in localStorage - try multiple possible key names
        keys_found = []
        
        # Get all localStorage items
        items = driver.execute_script("""
            var items = {};
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                items[key] = localStorage.getItem(key);
            }
            return items;
        """)
        
        if items:
            print(f"  [DEBUG] localStorage keys: {list(items.keys())}")
            for k, v in items.items():
                if v and 'infip-' in str(v):
                    # Try to parse as JSON array or direct key
                    if v.startswith('['):
                        try:
                            parsed = json.loads(v)
                            for item in parsed:
                                if isinstance(item, str) and item.startswith('infip-'):
                                    keys_found.append(item)
                                elif isinstance(item, dict):
                                    for field in ['key', 'value', 'api_key', 'token']:
                                        if field in item and str(item[field]).startswith('infip-'):
                                            keys_found.append(str(item[field]))
                        except:
                            pass
                    elif v.startswith('{'):
                        try:
                            parsed = json.loads(v)
                            for field in ['key', 'value', 'api_key', 'token', 'keys']:
                                if field in parsed:
                                    val = parsed[field]
                                    if isinstance(val, str) and val.startswith('infip-'):
                                        keys_found.append(val)
                                    elif isinstance(val, list):
                                        for entry in val:
                                            if isinstance(entry, str) and entry.startswith('infip-'):
                                                keys_found.append(entry)
                        except:
                            pass
                    elif str(v).startswith('infip-'):
                        keys_found.append(str(v).strip())
        
        return list(set(keys_found))
    except Exception as e:
        print(f"  [!] Error reading localStorage: {e}")
        return []


def read_keys_from_page(driver):
    """Scrape keys displayed directly on the API keys page."""
    keys_found = []
    try:
        # Look for elements containing infip- keys
        selectors = [
            (By.XPATH, "//td[contains(text(), 'infip-')]"),
            (By.XPATH, "//span[contains(text(), 'infip-')]"),
            (By.XPATH, "//p[contains(text(), 'infip-')]"),
            (By.XPATH, "//code[contains(text(), 'infip-')]"),
            (By.XPATH, "//*[contains(@class, 'font-mono') and contains(text(), 'infip-')]"),
            (By.CSS_SELECTOR, "td.font-mono"),
            (By.CSS_SELECTOR, "code"),
        ]
        
        for by, sel in selectors:
            try:
                elements = driver.find_elements(by, sel)
                for el in elements:
                    text = el.text or el.get_attribute('value') or el.get_attribute('textContent') or ''
                    if 'infip-' in text:
                        # Extract key from text
                        import re
                        matches = re.findall(r'infip-[a-f0-9]+', text)
                        keys_found.extend(matches)
            except:
                continue
        
        # Also check full page source
        import re
        page_src = driver.page_source
        matches = re.findall(r'infip-[a-f0-9]{8,}', page_src)
        keys_found.extend(matches)
        
    except Exception as e:
        print(f"  [!] Error reading page: {e}")
    
    return list(set(keys_found))


def dismiss_popup(driver):
    """Dismiss the 'Join Our Community' popup if present."""
    try:
        popup_wait = WebDriverWait(driver, 5)
        later_btn = popup_wait.until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Maybe Later')] | //*[contains(text(), 'Maybe Later')]"))
        )
        later_btn.click()
        time.sleep(1)
        print("  ✓ Dismissed popup")
        return True
    except TimeoutException:
        pass
    
    # Try close button
    try:
        close_btn = driver.find_element(By.XPATH, "//button[@aria-label='Close'] | //button[contains(@class, 'close')]")
        close_btn.click()
        time.sleep(1)
        print("  ✓ Dismissed popup via close button")
        return True
    except:
        pass
    
    return False


def try_generate_key(driver, timeout=30):
    """Try clicking Generate New Key and wait for a new key to appear."""
    try:
        # Dismiss popup if present
        dismiss_popup(driver)
        
        # Collect existing keys before generating
        existing_keys = set(read_keys_from_page(driver))
        
        # Find the Generate New Key button
        wait = WebDriverWait(driver, timeout)
        btn_selectors = [
            (By.XPATH, "//button[contains(., 'Generate New Key')]"),
            (By.XPATH, "//button[contains(., 'Generate')]"),
            (By.XPATH, "//button[contains(text(), 'Generate')]"),
            (By.XPATH, "//*[contains(@class, 'btn') and contains(., 'Generate')]"),
        ]

        generate_button = None
        for by, sel in btn_selectors:
            try:
                generate_button = wait.until(EC.element_to_be_clickable((by, sel)))
                print(f"  [INFO] Found generate button: '{generate_button.text}'")
                break
            except TimeoutException:
                continue

        if not generate_button:
            print("  [!] Generate button not found.")
            return None

        # Scroll to button and click
        driver.execute_script("arguments[0].scrollIntoView(true);", generate_button)
        time.sleep(0.5)
        generate_button.click()
        print("  [INFO] Clicked Generate New Key button.")
        time.sleep(4)

        # Check for denial/rate limit
        page_src = driver.page_source.lower()
        if any(kw in page_src for kw in ['denied', 'limit reached', 'too many', 'rate limit', 'try again later']):
            print("  [DENIED] Rate limited.")
            return 'denied'

        # Dismiss any new popup
        dismiss_popup(driver)

        # Wait for new key to appear on page
        for attempt in range(10):
            time.sleep(2)
            all_keys = set(read_keys_from_page(driver))
            new_keys = all_keys - existing_keys
            if new_keys:
                key = list(new_keys)[0]
                print(f"  ✓ New key detected on page: {key}")
                return key
            print(f"  [INFO] Waiting for key to appear... ({attempt + 1}/10)")

        # Check localStorage as fallback
        ls_keys = set(read_keys_from_localstorage(driver))
        new_ls_keys = ls_keys - existing_keys
        if new_ls_keys:
            key = list(new_ls_keys)[0]
            print(f"  ✓ New key found in localStorage: {key}")
            return key

        print("  [!] Could not detect a new key after generation.")
        return None

    except Exception as e:
        print(f"  [!] Error during key generation: {e}")
        traceback.print_exc()
        return None


def close_driver(driver):
    try:
        if driver:
            driver.quit()
    except:
        pass


def main():
    print("=" * 60)
    print("  Infip API Key Generator (Chrome/UC Edition)")
    print("=" * 60)

    api_keys = load_api_keys()
    print(f"Loaded {len(api_keys)} existing key(s) from keys.json")
    print(f"Target: generate {TARGET_KEYS} new key(s)\n")

    new_keys = 0

    while new_keys < TARGET_KEYS:
        print(f"\n--- Generating Key {new_keys + 1}/{TARGET_KEYS} ---")
        driver = None

        try:
            print("  Launching Chrome (undetected-chromedriver)...")
            options = uc.ChromeOptions()
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-blink-features=AutomationControlled")

            driver = uc.Chrome(version_main=146, headless=HEADLESS, use_subprocess=True, options=options)

            print(f"  Navigating to {TARGET_URL}...")
            driver.get(TARGET_URL)

            # Wait for Cloudflare
            cf_passed = wait_for_cloudflare(driver, timeout=120)
            if not cf_passed:
                print("  -> Cloudflare blocked. Skipping...")
                close_driver(driver)
                continue

            # Try to generate a key
            result = try_generate_key(driver)

            if result == 'denied':
                print("  -> Rate limited. Waiting 15s...")
                close_driver(driver)
                time.sleep(15)
                continue

            elif result is None:
                # Still try to read any keys already on the page
                page_keys = read_keys_from_page(driver)
                ls_keys = read_keys_from_localstorage(driver)
                all_found = set(page_keys + ls_keys)
                added = 0
                for k in all_found:
                    if k not in api_keys:
                        api_keys.append(k)
                        added += 1
                if added:
                    save_api_keys(api_keys)
                    print(f"  [INFO] Saved {added} previously existing key(s) from the page.")
                print("  -> No new key generated. Moving on...")
                close_driver(driver)
                new_keys += 1  # Count as attempt to avoid infinite loop
                continue

            else:
                # Success
                if result not in api_keys:
                    api_keys.append(result)
                    save_api_keys(api_keys)
                    print(f"  ✓ KEY {new_keys + 1}: {result}")
                    new_keys += 1
                else:
                    print(f"  [!] Duplicate key: {result}")
                    new_keys += 1

                close_driver(driver)
                time.sleep(3)

        except KeyboardInterrupt:
            print("\n\n[!] Interrupted by user")
            close_driver(driver)
            save_api_keys(api_keys)
            print(f"Saved {len(api_keys)} key(s) before exit.")
            return

        except Exception as e:
            print(f"  [!] Unexpected error: {e}")
            traceback.print_exc()
            close_driver(driver)
            time.sleep(3)
            new_keys += 1  # Avoid infinite loops on hard failures

    print("\n" + "=" * 60)
    print("  DONE")
    print("=" * 60)
    print(f"  New keys generated this session: {new_keys}")
    print(f"  Total keys in file: {len(api_keys)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
