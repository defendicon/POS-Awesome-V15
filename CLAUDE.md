# Claude Code Configuration for POSAwesome

## About This Project

POSAwesome is a Frappe application - a Point of Sale (POS) system built on the Frappe Framework. This is a full-stack web application with Python backend and Vue.js frontend components.

**Enhanced Camera Scanner**: Features advanced OpenCV-based image processing for superior barcode and QR code scanning with real-time image enhancement.

## Build Commands

### Main Build Commands
```bash
# Build frontend assets for production
bench build --app posawesome


# Force rebuild (cleans cache first)
bench build --app posawesome --force

# Build all apps in the bench
bench build
```

### Development Server
```bash
# Start development server
bench start

# Start with specific port
bench start --port 8000
```

## Project Structure

```
posawesome/
├── frontend/                 # Vue.js frontend
│   ├── src/
│   │   ├── posapp/
│   │   │   ├── components/   # Vue components
│   │   │   └── pages/        # Vue pages
│   │   └── main.js           # Frontend entry point
│   └── package.json          # Frontend dependencies
├── posawesome/               # Python backend
│   ├── public/               # Static assets
│   ├── posawesome/           # Main module
│   │   ├── doctype/         # DocType definitions
│   │   ├── api/             # API endpoints
│   │   └── hooks.py         # App hooks
├── CLAUDE.md                 # This file
└── pyproject.toml           # Python dependencies
```

## Common Development Commands

### Site Management
```bash
# Create new site
bench new-site mysite.local

# Install app on site
bench --site mysite.local install-app posawesome

# Migrate database
bench --site mysite.local migrate

# Access site console
bench --site mysite.local console

# Backup site
bench --site mysite.local backup
```

### Database Operations
```bash
# Run migrations
bench migrate

# Reload specific doctype
bench --site mysite.local console
>>> frappe.reload_doc('posawesome', 'doctype', 'pos_invoice')

# Clear cache
bench --site mysite.local clear-cache
```

### Code Quality & Testing
```bash
# Run tests
bench --site mysite.local run-tests --app posawesome

# Run specific module tests
bench --site mysite.local run-tests --module posawesome.tests.test_pos

# Check Python syntax issues
cd ~/frappe-bench/sites
../env/bin/python ../apps/frappe/frappe/utils/bench_helper.py
```

## Frontend Development

### Vue.js Components
- Built with Vue 3 and Vuetify
- Components located in `frontend/src/posapp/components/`
- Use composition API where possible
- Follow Frappe UI patterns and conventions

### Asset Building
- Uses Vite as build tool
- Automatic compilation on `bench build --app posawesome`
- Watch mode available with `--dev` flag

### Styling
- Uses Vuetify components and Material Design
- Custom SCSS in component `<style>` blocks
- RTL support implemented for Arabic/Hebrew

## Backend Development

### Frappe Framework Patterns
```python
# Get document
doc = frappe.get_doc("POS Invoice", invoice_name)

# Create new document
new_doc = frappe.new_doc("POS Invoice")
new_doc.update(data)
new_doc.insert()

# Database queries
invoices = frappe.get_list("POS Invoice", 
    filters={"status": "Draft"}, 
    fields=["name", "total"]
)

# Utilities
from frappe.utils import cint, flt, getdate, today
```

### API Development
```python
# In posawesome/api/pos.py
@frappe.whitelist()
def get_pos_data():
    return frappe.get_list("POS Invoice", limit=10)
```

### Hooks Configuration
Located in `posawesome/hooks.py`:
```python
# Document events
doc_events = {
    "POS Invoice": {
        "on_submit": "posawesome.api.pos.on_pos_invoice_submit"
    }
}
```

## Git Workflow

### Working with Forks
```bash
# Add your fork as remote
cd apps/posawesome
git remote add origin https://github.com/[username]/posawesome

# Create feature branch
git checkout -b feature/my-new-feature

# Stage and commit changes
git add .
git commit -m "Add new POS feature"

# Push to your fork
git push origin feature/my-new-feature
```

### Staying Updated
```bash
# Add upstream remote (original repo)
git remote add upstream https://github.com/yrestom/POS-Awesome

# Pull latest changes
git pull upstream develop

# Rebase your branch
git rebase upstream/develop
```

## Debugging Tips

### Common Issues
1. **Build Failures**: Clear cache with `bench clear-cache`
2. **Frontend Issues**: Check browser console and network tab
3. **Python Errors**: Check `bench start` output and error logs
4. **Database Issues**: Run `bench migrate` and check DocType definitions

### Development Tools
```bash
# Access Python console
bench --site mysite.local console

# Enable developer mode
bench --site mysite.local set-config developer_mode 1

# Show configuration
bench show-config

# List installed apps
bench list-apps --format json
```

## Key Dependencies

### Frontend
- Vue 3 - Frontend framework
- Vuetify - UI component library
- Vite - Build tool and dev server

### Backend  
- Frappe Framework - Full-stack web framework
- Python 3.8+ - Programming language
- MariaDB/MySQL - Database
- Redis - Caching and queuing

## Production Deployment

```bash
# Production build
bench build --app posawesome

# Setup production
bench setup production

# Restart services
bench restart

# Update app
bench update --app posawesome
```

## Useful Frappe APIs

```python
# Common utilities
from frappe.utils import cint, flt, cstr, getdate, add_days, today, now_datetime

# Database operations
frappe.db.get_value("DocType", "name", "field")
frappe.db.set_value("DocType", "name", "field", "value")
frappe.db.commit()

# User interactions
frappe.msgprint("Message")
frappe.throw("Error message")

# Translations
_("Text to translate")
```

## Configuration Notes

- This project uses the new esbuild-based build system (Frappe v14+)
- Frontend assets are compiled to `posawesome/public/dist/`
- Development mode enables auto-reloading and debugging features
- Production builds are optimized and minified