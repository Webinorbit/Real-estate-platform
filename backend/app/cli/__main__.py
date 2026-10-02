"""Command line entry point: `python -m app.cli <command>` (run from backend/).

  seed            wipe + recreate the three demo tenants
  tenant:create   onboard a new client (tenant + owner login)
  migrate         apply database migrations (delegates to app.migrate.run() when present)
"""

import argparse
import importlib
import os
import sys

TENANT_USAGE = """Usage: python -m app.cli tenant:create --name "Acme Realty" --slug acme --owner-email owner@acme.com
  Options: --plan STARTER|PRO|ENTERPRISE (default STARTER)  --owner-name  --password  --domain  --city  --currency"""


def cmd_seed(_args) -> int:
    from app.cli.seed import run

    run()
    return 0


def cmd_tenant_create(args) -> int:
    from app.db import SessionLocal
    from app.errors import UserError
    from app.onboard import onboard_tenant

    if not (args.name and args.slug and args.owner_email):
        print(TENANT_USAGE)
        return 1

    with SessionLocal() as db:
        try:
            result = onboard_tenant(
                db,
                {
                    "name": args.name,
                    "slug": args.slug,
                    "plan": args.plan,
                    "ownerEmail": args.owner_email,
                    "ownerName": args.owner_name,
                    "password": args.password,
                    "customDomain": args.domain,
                    "city": args.city,
                    "currency": args.currency,
                },
            )
        except UserError as err:
            print(f"Error: {err.message}", file=sys.stderr)
            return 1

    tenant, owner = result["tenant"], result["owner"]
    root = os.environ.get("ROOT_DOMAIN") or "localhost:3000"
    print(f"\nCreated {tenant.name} ({tenant.plan})")
    print(f"  Site:   {'https://' + tenant.customDomain if tenant.customDomain else f'https://{tenant.slug}.{root}'}")
    print(f"  Admin:  /admin  ({owner.email})")
    print(f"  Password: {result['password']}")
    print("\nNext: sign in, upload a logo, pick brand colours, and add the first listings.\n")
    return 0


def cmd_migrate(_args) -> int:
    try:
        migrate = importlib.import_module("app.migrate")
    except ModuleNotFoundError as err:
        if err.name != "app.migrate":
            raise
        print("No app.migrate module yet; migrations are not wired up. (Expected: app/migrate.py exposing run().)")
        return 0
    migrate.run()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Real estate platform maintenance commands")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("seed", help="Wipe and recreate the demo tenants").set_defaults(func=cmd_seed)

    t = sub.add_parser("tenant:create", help="Onboard a new client in one command", add_help=False)
    t.add_argument("--help", "-h", action="store_true", dest="show_help")
    t.add_argument("--name")
    t.add_argument("--slug")
    t.add_argument("--plan")
    t.add_argument("--owner-email", dest="owner_email")
    t.add_argument("--owner-name", dest="owner_name")
    t.add_argument("--password")
    t.add_argument("--domain")
    t.add_argument("--city")
    t.add_argument("--currency")
    t.set_defaults(func=cmd_tenant_create)

    sub.add_parser("migrate", help="Apply database migrations").set_defaults(func=cmd_migrate)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "show_help", False):
        print(TENANT_USAGE)
        return 0
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
