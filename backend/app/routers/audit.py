from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from ..audit import add_audit
from ..database import get_db
from ..models import AuditEvent, VaultClient, VaultItem
from ..schemas import AuditClientEvent
from ..security import AuthContext, get_auth_context
from ..utils import decode_cursor, encode_cursor

router = APIRouter(prefix="/audit", tags=["audit"])

def _serialize(row: AuditEvent) -> dict:
    return {"id":str(row.id),"event":row.event,"object_type":row.object_type,"object_id":str(row.object_id) if row.object_id else None,"created_at":row.created_at,"session_id":str(row.session_id) if row.session_id else None}

def _page(rows, limit:int):
    next_cursor=None
    if len(rows)>limit:
        last=rows[limit-1]
        next_cursor=encode_cursor(last.created_at,last.id)
        rows=rows[:limit]
    return {"items":[_serialize(r) for r in rows],"next_cursor":next_cursor}

@router.get("")
def list_audit(limit:int=50,cursor:str|None=None,events:str|None=None,object_type:str|None=None,q:str|None=None,auth:AuthContext=Depends(get_auth_context),db:Session=Depends(get_db)):
    limit=max(10,min(limit,100));query=select(AuditEvent).where(AuditEvent.user_id==auth.user.id)
    if events:
        values=[x.strip().upper() for x in events.split(',') if x.strip()]
        if values: query=query.where(AuditEvent.event.in_(values))
    if object_type in {'client','item','session','vault'}: query=query.where(AuditEvent.object_type==object_type)
    if q and q.strip():
        term=f"%{q.strip().upper()}%"
        query=query.where(or_(AuditEvent.event.ilike(term),AuditEvent.object_type.ilike(f"%{q.strip()}%")))
    if cursor:
        created_at,row_id=decode_cursor(cursor)
        query=query.where(or_(AuditEvent.created_at<created_at,and_(AuditEvent.created_at==created_at,AuditEvent.id<row_id)))
    rows=db.scalars(query.order_by(AuditEvent.created_at.desc(),AuditEvent.id.desc()).limit(limit+1)).all()
    return _page(rows,limit)

@router.get("/client/{client_id}")
def client_timeline(client_id:UUID,limit:int=50,cursor:str|None=None,auth:AuthContext=Depends(get_auth_context),db:Session=Depends(get_db)):
    limit=max(10,min(limit,100));client=db.scalar(select(VaultClient).where(VaultClient.id==client_id,VaultClient.user_id==auth.user.id))
    if not client: raise HTTPException(status_code=404,detail="Client not found")
    item_ids=list(db.scalars(select(VaultItem.id).where(VaultItem.user_id==auth.user.id,VaultItem.client_id==client_id)).all())
    conditions=[(AuditEvent.object_type=="client")&(AuditEvent.object_id==client_id)]
    if item_ids: conditions.append((AuditEvent.object_type=="item")&(AuditEvent.object_id.in_(item_ids)))
    query=select(AuditEvent).where(AuditEvent.user_id==auth.user.id,or_(*conditions))
    if cursor:
        created_at,row_id=decode_cursor(cursor);query=query.where(or_(AuditEvent.created_at<created_at,and_(AuditEvent.created_at==created_at,AuditEvent.id<row_id)))
    rows=db.scalars(query.order_by(AuditEvent.created_at.desc(),AuditEvent.id.desc()).limit(limit+1)).all()
    return _page(rows,limit)

@router.post("/event",status_code=204)
def client_event(payload:AuditClientEvent,auth:AuthContext=Depends(get_auth_context),db:Session=Depends(get_db)):
    add_audit(db,auth.user.id,auth.session.id,payload.event,payload.object_type,payload.object_id);db.commit()
