import argparse
import asyncio
import json

from app.schemas import SearchRequest
from app.services.search_service import SearchService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HBX Scraping Engine CLI")
    parser.add_argument("--city", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--segment", default="")
    parser.add_argument("--target-type", choices=("pj", "pf", "agenda_pf"), default="pj")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--fresh", action="store_true")
    return parser


async def run() -> None:
    args = build_parser().parse_args()
    request = SearchRequest(
        city=args.city,
        state=args.state,
        segment=args.segment,
        targetType=args.target_type,
        limit=args.limit,
        fresh=args.fresh,
    )
    response = await SearchService().search(request)
    print(json.dumps(response.model_dump(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(run())
