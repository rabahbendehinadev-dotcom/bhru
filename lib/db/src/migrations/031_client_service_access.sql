-- Absence of a rule inherits existing availability. No policy backfill.
CREATE TABLE client_group_service_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL,
 group_id uuid NOT NULL,service_id uuid NOT NULL,effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,group_id,service_id),
 FOREIGN KEY(subscriber_id,group_id) REFERENCES reseller_client_groups(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id) ON DELETE RESTRICT
);
CREATE TABLE customer_service_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL,
 customer_id uuid NOT NULL,service_id uuid NOT NULL,effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,customer_id,service_id),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id) ON DELETE RESTRICT
);
CREATE TABLE client_group_category_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL,
 group_id uuid NOT NULL,category_id uuid NOT NULL,effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,group_id,category_id),
 FOREIGN KEY(subscriber_id,group_id) REFERENCES reseller_client_groups(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,category_id) REFERENCES manual_service_groups(subscriber_id,id) ON DELETE RESTRICT
);
CREATE TABLE customer_category_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL,
 customer_id uuid NOT NULL,category_id uuid NOT NULL,effect text NOT NULL CHECK(effect IN('ALLOW','DENY')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,customer_id,category_id),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,category_id) REFERENCES manual_service_groups(subscriber_id,id) ON DELETE RESTRICT
);

-- One resolver for both owner previews and authenticated customer authorization.
-- A non-null customer always resolves its own stored group, ignoring p_group.
CREATE FUNCTION resolve_client_service_access(p_sub uuid,p_customer uuid,p_group uuid,p_service uuid)
RETURNS TABLE(allowed boolean,reason_code text,source text,matched_policy_id uuid)
LANGUAGE sql STABLE AS $$
 WITH subject AS (
  SELECT CASE WHEN p_customer IS NOT NULL THEN c.client_group_id ELSE g.id END group_id,
   CASE WHEN p_customer IS NOT NULL THEN c.id IS NOT NULL ELSE g.id IS NOT NULL END found,
   CASE WHEN p_customer IS NOT NULL THEN coalesce(c.enabled,false) ELSE true END eligible
  FROM (SELECT 1) seed
  LEFT JOIN public_customer_accounts c ON c.subscriber_id=p_sub AND c.id=p_customer
  LEFT JOIN reseller_client_groups g ON g.subscriber_id=p_sub AND g.id=p_group
 ), facts AS (
  SELECT sub.*,s.id service_id,s.active,cat.id category_id,cat.enabled category_enabled,
   cs.id cs_id,cs.effect cs_effect,cc.id cc_id,cc.effect cc_effect,
   gs.id gs_id,gs.effect gs_effect,gc.id gc_id,gc.effect gc_effect
  FROM subject sub
  LEFT JOIN manual_services s ON s.subscriber_id=p_sub AND s.id=p_service
  LEFT JOIN manual_service_groups cat ON cat.subscriber_id=p_sub AND cat.id=s.group_id
  LEFT JOIN reseller_client_groups g ON g.subscriber_id=p_sub AND g.id=sub.group_id AND g.is_active
  LEFT JOIN customer_service_access cs ON cs.subscriber_id=p_sub AND cs.customer_id=p_customer AND cs.service_id=s.id
  LEFT JOIN customer_category_access cc ON cc.subscriber_id=p_sub AND cc.customer_id=p_customer AND cc.category_id=cat.id
  LEFT JOIN client_group_service_access gs ON gs.subscriber_id=p_sub AND gs.group_id=g.id AND gs.service_id=s.id
  LEFT JOIN client_group_category_access gc ON gc.subscriber_id=p_sub AND gc.group_id=g.id AND gc.category_id=cat.id
 ), decision AS (
  SELECT *,coalesce(cs_effect,cc_effect,gs_effect,gc_effect,'ALLOW') effect,
   CASE WHEN cs_id IS NOT NULL THEN 'CUSTOMER_SERVICE' WHEN cc_id IS NOT NULL THEN 'CUSTOMER_CATEGORY'
    WHEN gs_id IS NOT NULL THEN 'GROUP_SERVICE' WHEN gc_id IS NOT NULL THEN 'GROUP_CATEGORY' ELSE 'DEFAULT' END policy_source,
   coalesce(cs_id,cc_id,gs_id,gc_id) policy_id FROM facts
 )
 SELECT found AND eligible AND service_id IS NOT NULL AND coalesce(active,false)
    AND coalesce(category_enabled,true) AND effect='ALLOW',
  CASE WHEN NOT found OR service_id IS NULL THEN 'DENIED_NOT_FOUND'
   WHEN NOT eligible THEN 'DENIED_EXISTING_ELIGIBILITY'
   WHEN NOT active THEN 'DENIED_GLOBAL_SERVICE'
   WHEN category_id IS NOT NULL AND NOT category_enabled THEN 'DENIED_GLOBAL_CATEGORY'
   WHEN effect='DENY' AND policy_source LIKE '%CATEGORY' THEN 'DENIED_BY_CATEGORY_POLICY'
   WHEN effect='DENY' AND policy_source LIKE 'CUSTOMER%' THEN 'DENIED_BY_CUSTOMER'
   WHEN effect='DENY' THEN 'DENIED_BY_GROUP'
   WHEN policy_source LIKE 'CUSTOMER%' THEN 'ALLOWED_BY_CUSTOMER'
   WHEN policy_source LIKE 'GROUP%' THEN 'ALLOWED_BY_GROUP' ELSE 'ALLOWED_BY_DEFAULT' END,
  CASE WHEN NOT found OR NOT eligible OR service_id IS NULL OR NOT coalesce(active,false)
    OR NOT coalesce(category_enabled,true) THEN 'GLOBAL' ELSE policy_source END,
  CASE WHEN NOT found OR NOT eligible OR service_id IS NULL OR NOT coalesce(active,false)
    OR NOT coalesce(category_enabled,true) THEN NULL ELSE policy_id END
 FROM decision;
$$;

CREATE TABLE client_service_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES account_users(id),group_id uuid,customer_id uuid,
 service_id uuid,category_id uuid,action text NOT NULL CHECK(action IN('created','updated','removed')),
 previous_effect text CHECK(previous_effect IN('ALLOW','DENY')),new_effect text CHECK(new_effect IN('ALLOW','DENY')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(group_id,customer_id)=1 AND num_nonnulls(service_id,category_id)=1),
 CHECK((action='created' AND previous_effect IS NULL AND new_effect IS NOT NULL)
   OR(action='updated' AND previous_effect IS NOT NULL AND new_effect IS NOT NULL AND previous_effect<>new_effect)
   OR(action='removed' AND previous_effect IS NOT NULL AND new_effect IS NULL)),
 FOREIGN KEY(subscriber_id,group_id) REFERENCES reseller_client_groups(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,category_id) REFERENCES manual_service_groups(subscriber_id,id) ON DELETE RESTRICT
);
CREATE INDEX client_access_events_subject ON client_service_access_events(subscriber_id,customer_id,created_at DESC);
CREATE FUNCTION protect_client_access_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Service access audit is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM account_users WHERE id=NEW.actor_id AND subscriber_id=NEW.subscriber_id)
 THEN RAISE EXCEPTION 'Invalid service access actor'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER client_access_event_guard BEFORE INSERT OR UPDATE OR DELETE ON client_service_access_events
 FOR EACH ROW EXECUTE FUNCTION protect_client_access_event();

CREATE FUNCTION audit_client_service_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb;before_effect text;after_effect text;actor uuid;kind text;
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'effect'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'effect'-'updated_at')
 THEN RAISE EXCEPTION 'Policy identity is immutable'; END IF;
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP<>'INSERT' THEN before_effect:=OLD.effect; END IF;
 IF TG_OP<>'DELETE' THEN after_effect:=NEW.effect; END IF;
 IF before_effect IS NOT DISTINCT FROM after_effect THEN RETURN NULL; END IF;
 actor:=nullif(current_setting('bhru.service_access_actor',true),'')::uuid;
 IF actor IS NULL THEN RAISE EXCEPTION 'Verified reseller context required for service access mutation'; END IF;
 INSERT INTO client_service_access_events(subscriber_id,actor_id,group_id,customer_id,service_id,category_id,action,previous_effect,new_effect)
 VALUES((r->>'subscriber_id')::uuid,actor,(r->>'group_id')::uuid,(r->>'customer_id')::uuid,
  (r->>'service_id')::uuid,(r->>'category_id')::uuid,
  CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'removed' END,before_effect,after_effect);
 IF r->>'customer_id' IS NOT NULL THEN
  kind:=CASE WHEN r->>'category_id' IS NOT NULL THEN 'customer_category_access_changed'
    ELSE 'customer_service_access_'||CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'removed' END END;
  PERFORM emit_client_activity((r->>'subscriber_id')::uuid,(r->>'customer_id')::uuid,kind,'PROFILE','customer_account',
    (r->>'customer_id')::uuid,gen_random_uuid()::text);
 END IF;
 RETURN NULL;
END $$;
DO $$
DECLARE tab text;source text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['client_group_service_access','customer_service_access','client_group_category_access','customer_category_access'] LOOP
  EXECUTE format('CREATE TRIGGER access_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION lock_pricing_write()',tab);
  EXECUTE format('CREATE TRIGGER access_policy_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_client_service_access()',tab);
 END LOOP;
 SELECT pg_get_functiondef('validate_client_activity()'::regprocedure) INTO source;
 source:=replace(source,
  '(''profile_updated'',''PROFILE'',''customer_account'',''Profile updated''),',
  '(''customer_service_access_created'',''PROFILE'',''customer_account'',''Service access override created''),(''customer_service_access_updated'',''PROFILE'',''customer_account'',''Service access override updated''),(''customer_service_access_removed'',''PROFILE'',''customer_account'',''Service access override removed''),(''customer_category_access_changed'',''PROFILE'',''customer_account'',''Category access override changed''),(''profile_updated'',''PROFILE'',''customer_account'',''Profile updated''),');
 EXECUTE source;
END $$;
