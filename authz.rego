package authz.user

default allow := false

allow if {
  input.cloudbase.resource_type == "functions"
  input.cloudbase.resource_name == "mbti-http-api"
  input.subject.auth_type == "anonymous"
}
