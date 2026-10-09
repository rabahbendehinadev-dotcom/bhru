-- Prospective business audit only. No historical events or financial rewrites.
CREATE TABLE client_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  event_category text NOT NULL CHECK(event_category IN ('ACCOUNT','PROFILE','FINANCIAL','ORDER','SECURITY')),
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('customer','subscriber_owner','system')),
  actor_id uuid,
  actor_display_snapshot text NOT NULL,
  reference_type text NOT NULL CHECK(reference_type IN ('customer_account','service_order','wallet_ledger_entry')),
  reference_id uuid NOT NULL,
  event_key text NOT NULL CHECK(length(event_key) BETWEEN 1 AND 180),
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  ip_address inet,
  user_agent text CHECK(length(user_agent)<=500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id),
  UNIQUE(subscriber_id,customer_id,event_key),
  CHECK((actor_type='system' AND actor_id IS NULL) OR (actor_type<>'system' AND actor_id IS NOT NULL))
);
CREATE INDEX client_activity_chronology ON client_activity_events(subscriber_id,customer_id,created_at DESC,id DESC);
CREATE INDEX client_activity_category ON client_activity_events(subscriber_id,customer_id,event_category,created_at DESC,id DESC);
CREATE UNIQUE INDEX client_activity_one_posting ON client_activity_events(subscriber_id,customer_id,reference_id)
  WHERE reference_type='wallet_ledger_entry';
CREATE UNIQUE INDEX client_activity_one_order_transition ON client_activity_events(subscriber_id,customer_id,reference_id,event_type)
  WHERE reference_type='service_order';
CREATE TRIGGER client_activity_immutable BEFORE UPDATE OR DELETE ON client_activity_events
  FOR EACH ROW EXECUTE FUNCTION immutable_wallet_ledger();

-- Database validation is the final boundary, including for internal writers.
CREATE FUNCTION validate_client_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_category text; expected_reference text; expected_summary text; display_name text; ledger customer_wallet_ledger%ROWTYPE;
BEGIN
  SELECT category,reference_kind,label INTO expected_category,expected_reference,expected_summary
  FROM (VALUES
    ('account_created','ACCOUNT','customer_account','Account created'),
    ('account_blocked','ACCOUNT','customer_account','Account blocked'),
    ('account_unblocked','ACCOUNT','customer_account','Account unblocked'),
    ('profile_updated','PROFILE','customer_account','Profile updated'),
    ('client_note_added','PROFILE','customer_account','Reseller note added'),
    ('wallet_funds_added','FINANCIAL','wallet_ledger_entry','Funds added'),
    ('wallet_deducted','FINANCIAL','wallet_ledger_entry','Funds deducted'),
    ('wallet_adjusted','FINANCIAL','wallet_ledger_entry','Wallet adjusted'),
    ('service_order_charged','FINANCIAL','wallet_ledger_entry','Service order charged'),
    ('service_order_refunded','FINANCIAL','wallet_ledger_entry','Service order refunded'),
    ('service_order_created','ORDER','service_order','Service order created'),
    ('service_order_processing','ORDER','service_order','Service order processing'),
    ('service_order_completed','ORDER','service_order','Service order completed'),
    ('service_order_rejected','ORDER','service_order','Service order rejected'),
    ('customer_logged_out','SECURITY','customer_account','Customer logged out')
  ) AS registry(type,category,reference_kind,label) WHERE type=NEW.event_type;
  IF expected_category IS NULL OR NEW.event_category<>expected_category OR NEW.reference_type<>expected_reference THEN
    RAISE EXCEPTION 'Unknown or inconsistent activity taxonomy';
  END IF;
  NEW.summary:=expected_summary;
  NEW.created_at:=clock_timestamp();
  IF NEW.actor_type='subscriber_owner' THEN
    SELECT full_name INTO display_name FROM account_users WHERE subscriber_id=NEW.subscriber_id AND id=NEW.actor_id;
  ELSIF NEW.actor_type='customer' THEN
    SELECT concat_ws(' ',first_name,last_name) INTO display_name FROM public_customer_accounts
      WHERE subscriber_id=NEW.subscriber_id AND id=NEW.customer_id AND id=NEW.actor_id;
  ELSE display_name:='System';
  END IF;
  IF display_name IS NULL OR btrim(display_name)='' THEN RAISE EXCEPTION 'Invalid activity actor'; END IF;
  NEW.actor_display_snapshot:=display_name;
  IF NEW.reference_type='customer_account' THEN
    IF NEW.reference_id<>NEW.customer_id THEN RAISE EXCEPTION 'Invalid account activity reference'; END IF;
  ELSIF NEW.reference_type='service_order' THEN
    IF NOT EXISTS(SELECT 1 FROM service_orders WHERE subscriber_id=NEW.subscriber_id
      AND customer_id=NEW.customer_id AND id=NEW.reference_id) THEN RAISE EXCEPTION 'Invalid order activity reference'; END IF;
  ELSE
    SELECT * INTO ledger FROM customer_wallet_ledger WHERE subscriber_id=NEW.subscriber_id
      AND customer_id=NEW.customer_id AND id=NEW.reference_id;
    IF ledger.id IS NULL THEN RAISE EXCEPTION 'Invalid ledger activity reference'; END IF;
    IF NEW.event_type<>(CASE ledger.type WHEN 'admin_credit' THEN 'wallet_funds_added'
      WHEN 'admin_debit' THEN 'wallet_deducted' WHEN 'adjustment' THEN 'wallet_adjusted'
      WHEN 'order_debit' THEN 'service_order_charged' WHEN 'order_refund' THEN 'service_order_refunded' END)
      OR NEW.actor_type<>ledger.created_by_type OR NEW.actor_id IS DISTINCT FROM ledger.created_by_id THEN
      RAISE EXCEPTION 'Ledger attribution must remain authoritative';
    END IF;
    NEW.actor_display_snapshot:=ledger.actor_display_snapshot;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.metadata) k WHERE k NOT IN ('changed_fields','reason','previous_status','status')) THEN
    RAISE EXCEPTION 'Unsupported activity metadata';
  END IF;
  IF NEW.metadata ? 'changed_fields' THEN
    IF NEW.event_type<>'profile_updated' OR jsonb_typeof(NEW.metadata->'changed_fields')<>'array' THEN
      RAISE EXCEPTION 'Invalid profile activity metadata';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.metadata->'changed_fields') f WHERE f NOT IN
      ('first_name','last_name','username','whatsapp_phone','preferred_language','newsletter_opt_in',
       'address_line_1','address_line_2','country_code','state','city','postal_code')) THEN
      RAISE EXCEPTION 'Unsupported changed field';
    END IF;
  END IF;
  IF NEW.metadata ? 'reason' AND (NEW.event_type NOT IN ('account_blocked','account_unblocked')
    OR jsonb_typeof(NEW.metadata->'reason')<>'string' OR length(NEW.metadata->>'reason')>1000) THEN
    RAISE EXCEPTION 'Invalid account reason';
  END IF;
  IF (NEW.metadata ? 'status' OR NEW.metadata ? 'previous_status') AND
    (NEW.event_type NOT IN ('account_blocked','account_unblocked') OR
     coalesce(jsonb_typeof(NEW.metadata->'status'),'')<>'string' OR
     coalesce(jsonb_typeof(NEW.metadata->'previous_status'),'')<>'string' OR
     coalesce(NEW.metadata->>'status','') NOT IN ('active','blocked') OR coalesce(NEW.metadata->>'previous_status','') NOT IN ('active','blocked')) THEN
    RAISE EXCEPTION 'Invalid status metadata';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_activity_validate BEFORE INSERT ON client_activity_events
  FOR EACH ROW EXECUTE FUNCTION validate_client_activity();

-- Context is transaction-local and set only by trusted server operations.
CREATE FUNCTION emit_client_activity(sub uuid, customer uuid, kind text, category text, ref_kind text,
  ref uuid, key text, details jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ctx jsonb := coalesce(nullif(current_setting('bhru.activity_context',true),''),'{}')::jsonb;
BEGIN
  IF ctx ? 'subscriber_id' AND (ctx->>'subscriber_id'<>sub::text OR ctx->>'customer_id'<>customer::text) THEN
    RAISE EXCEPTION 'Activity context belongs to another client';
  END IF;
  INSERT INTO client_activity_events(subscriber_id,customer_id,event_category,event_type,actor_type,actor_id,
    actor_display_snapshot,reference_type,reference_id,event_key,summary,metadata,ip_address,user_agent)
  VALUES(sub,customer,category,kind,coalesce(ctx->>'actor_type','system'),(ctx->>'actor_id')::uuid,'',
    ref_kind,ref,key,'',details,(ctx->>'ip_address')::inet,ctx->>'user_agent');
END $$;

CREATE FUNCTION capture_client_account_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed text[]; ctx jsonb := coalesce(nullif(current_setting('bhru.activity_context',true),''),'{}')::jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM emit_client_activity(NEW.subscriber_id,NEW.id,'account_created','ACCOUNT','customer_account',
      NEW.id,'account:'||NEW.id::text||':created');
    RETURN NEW;
  END IF;
  IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    PERFORM emit_client_activity(NEW.subscriber_id,NEW.id,
      CASE WHEN NEW.enabled THEN 'account_unblocked' ELSE 'account_blocked' END,'ACCOUNT','customer_account',
      NEW.id,gen_random_uuid()::text,jsonb_build_object(
        'previous_status',CASE WHEN OLD.enabled THEN 'active' ELSE 'blocked' END,
        'status',CASE WHEN NEW.enabled THEN 'active' ELSE 'blocked' END)
        ||CASE WHEN coalesce(ctx->>'reason','')<>'' THEN jsonb_build_object('reason',ctx->>'reason') ELSE '{}'::jsonb END);
  END IF;
  SELECT array_agg(k ORDER BY k) INTO changed FROM unnest(ARRAY[
    'first_name','last_name','username','whatsapp_phone','preferred_language','newsletter_opt_in',
    'address_line_1','address_line_2','country_code','state','city','postal_code'
  ]) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k;
  IF cardinality(changed)>0 THEN
    PERFORM emit_client_activity(NEW.subscriber_id,NEW.id,'profile_updated','PROFILE','customer_account',
      NEW.id,gen_random_uuid()::text,jsonb_build_object('changed_fields',to_jsonb(changed)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_account_activity AFTER INSERT OR UPDATE ON public_customer_accounts
  FOR EACH ROW EXECUTE FUNCTION capture_client_account_activity();

CREATE FUNCTION capture_client_financial_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO client_activity_events(subscriber_id,customer_id,event_category,event_type,actor_type,actor_id,
    actor_display_snapshot,reference_type,reference_id,event_key,summary)
  VALUES(NEW.subscriber_id,NEW.customer_id,'FINANCIAL',CASE NEW.type
    WHEN 'admin_credit' THEN 'wallet_funds_added' WHEN 'admin_debit' THEN 'wallet_deducted'
    WHEN 'adjustment' THEN 'wallet_adjusted' WHEN 'order_debit' THEN 'service_order_charged'
    WHEN 'order_refund' THEN 'service_order_refunded' END,
    NEW.created_by_type,NEW.created_by_id,NEW.actor_display_snapshot,'wallet_ledger_entry',NEW.id,'ledger:'||NEW.id::text,'');
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_ledger_activity AFTER INSERT ON customer_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION capture_client_financial_activity();

CREATE FUNCTION capture_client_order_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM emit_client_activity(NEW.subscriber_id,NEW.customer_id,'service_order_created','ORDER','service_order',
      NEW.id,'order:'||NEW.id::text||':created');
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('processing','completed','rejected') THEN
    PERFORM emit_client_activity(NEW.subscriber_id,NEW.customer_id,'service_order_'||NEW.status,'ORDER','service_order',
      NEW.id,'order:'||NEW.id::text||':'||NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_order_activity AFTER INSERT OR UPDATE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION capture_client_order_activity();

CREATE FUNCTION capture_client_note_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM emit_client_activity(NEW.subscriber_id,NEW.customer_id,'client_note_added','PROFILE','customer_account',
    NEW.customer_id,'note:'||NEW.id::text);
  RETURN NEW;
END $$;
CREATE TRIGGER reseller_client_note_activity AFTER INSERT ON reseller_client_notes
  FOR EACH ROW EXECUTE FUNCTION capture_client_note_activity();
