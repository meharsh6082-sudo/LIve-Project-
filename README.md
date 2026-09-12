# Mandi & Market — live price board

A small full-stack app that shows live-ish mandi (agricultural market) prices
next to live NSE/BSE stock prices, auto-refreshing in the browser.

- **Backend**: FastAPI + MySQL on Railway, with SQLite fallback for local development. Two background jobs poll external sources on
  a schedule and write into the DB; the frontend just reads from your own API.
- **Mandi data**: [data.gov.in](https://data.gov.in)'s AGMARKNET dataset (free, government).
- **Stock data**: `yfinance` (wraps Yahoo Finance — free, no key, unofficial).
- **Frontend**: plain HTML/CSS/JS, no build step.

## Run it

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open **http://localhost:8000**.

## Deploy to Railway with MySQL

The repository includes `railway.toml` and a root `requirements.txt` for deployment.

1. Create a Railway project and add a MySQL service.
2. Deploy the `live-market` folder from GitHub.
3. Add the MySQL service variables to the web service: `MYSQLHOST`, `MYSQLPORT`,
  `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE`.
4. Add `DB_BACKEND=mysql`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and
  `DATA_GOV_IN_API_KEY` as environment variables.
5. Generate a Railway public domain. Railway will run the command in
  `railway.toml` and expose the app at that URL.

To copy the existing local SQLite data into the Railway MySQL database, set the
MySQL variables in a local terminal and run:

```powershell
cd backend
$env:DB_BACKEND="mysql"
python migrate_sqlite_to_mysql.py
```

Do not commit database passwords or API keys. The app automatically uses local
SQLite when `DB_BACKEND` is not set to `mysql`.

## Free Oracle Cloud deployment

For a 24-hour free server, use an Oracle Cloud Always Free Ubuntu VM. The
project includes `Dockerfile` and `docker-compose.oracle.yml`; MySQL data is
stored in a persistent Docker volume.

On the VM, install Docker, copy this project to the VM, then run:

```bash
cp .env.oracle.example .env
nano .env
docker compose -f docker-compose.oracle.yml up -d --build
```

Allow TCP port `8000` in the Oracle Cloud security list and the Ubuntu firewall:

```bash
sudo ufw allow 8000/tcp
```

Open `http://YOUR_VM_PUBLIC_IP:8000`. Do not commit the `.env` file. For a
clean HTTPS domain later, put Nginx or Caddy in front of port 8000.

The `/admin` page is password protected. For local development the fallback
password is `admin123`. Set a custom password before starting the server:

```powershell
$env:ADMIN_PASSWORD="your_strong_password"
$env:ADMIN_SESSION_SECRET="another_long_random_secret"
```

On startup the server does an immediate fetch of both data sources, then
keeps refreshing: stocks every 15s, mandi prices every hour (the government
dataset itself only updates once a day, so there's no point polling it
constantly).

## Get your own data.gov.in API key (recommended)

The mandi API requires a free data.gov.in API key. Configure it before
starting the backend:

1. Sign up free at https://data.gov.in
2. Go to *My Account → API Keys* and copy your key
3. Set the variable in PowerShell (or configure it in your environment):
   ```
  $env:DATA_GOV_IN_API_KEY="your_key_here"
   ```

## Customize what shows up

Edit the watchlists at the top of `backend/main.py`:

```python
MANDI_STATES = ["Rajasthan", "Maharashtra", "Uttar Pradesh"]
MANDI_COMMODITIES = ["Onion", "Wheat", "Tomato", "Potato", "Cotton"]

STOCK_SYMBOLS = ["^NSEI", "^BSESN", "RELIANCE.NS", "TCS.NS", ...]
```

Stock symbols use Yahoo's convention: `.NS` for NSE, `.BO` for BSE, `^` prefix
for indices (`^NSEI` = Nifty 50, `^BSESN` = Sensex).

## Notes / limitations

- Stock prices via `yfinance` are near-real-time, not exchange-grade —
  fine for a dashboard, not for trading decisions.
- Mandi prices are wholesale, reported daily by market yards — they won't
  tick every second like a stock ticker, by nature of the source.
- The DB (`backend/market.db`) only keeps the *latest* value per item, not
  history. Add a history table later if you want price charts over time.
- If you deploy this publicly, put a real webserver (not `--reload`) and a
  process manager in front of uvicorn, and consider caching more
  aggressively to stay within data.gov.in's rate limits.

## Project structure

```
backend/
  main.py             FastAPI app, scheduler, watchlists, routes
  database.py          SQLite setup + queries
  fetchers/
    mandi.py            data.gov.in / AGMARKNET fetcher
    stocks.py            yfinance fetcher
  requirements.txt
frontend/
  index.html
  style.css             visual design (dark "market pulse" theme)
  app.js                polling, rendering, live-update flash effect
```
