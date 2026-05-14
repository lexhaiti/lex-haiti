from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class EditorialActionRead(BaseModel):
    id: int
    actor: str
    action: str
    target_type: str
    target_id: int
    diff: Optional[dict[str, Any]] = None
    comment: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
