#!/usr/bin/env bash
# Resolve the task definition a failed release rolls back to, pinned to the
# image digest the service is RUNNING, and keep that image in ECR. Prints the
# rollback task definition's ARN on its last line.
#
# usage: pin-ecs-rollback-target.sh <cluster> <service> <container> <repository-uri>
#
# The running revision is the rollback target only when it already names its
# image by digest. A revision that names a TAG (the base revision Terraform
# registered, `oxy/schedio:latest`) does not identify a release: the tag moves,
# so rolling back to it starts whatever the tag points at by then, which can be
# the very release being rolled back. For such a revision the target is a new
# revision derived from it with only the image replaced by the digest its
# running tasks actually pulled (`describe-tasks` imageDigest).
#
# Either way the digest must still be in ECR, and it is tagged `deployed-<sha>`
# (the commit tag it carries, else its own hex) so the lifecycle policy's
# `deployed-*` rule keeps it for as long as it is a recent release. A target
# that cannot be pulled is no rollback at all, so this fails before anything
# is rolled out.
#
# DRY_RUN=1 registers and tags nothing: it prints the definition it would
# register, or the running one's ARN when that is already pinned.

set -euo pipefail

if (($# != 4)); then
  echo "usage: $0 <cluster> <service> <container> <repository-uri>" >&2
  exit 2
fi

cluster="$1"
service="$2"
container="$3"
repository_uri="$4"
repository="${repository_uri#*/}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
digest_pattern='^sha256:[0-9a-f]{64}$'

running_task_definition="$(aws ecs describe-services --cluster "$cluster" --services "$service" \
  --query 'services[0].taskDefinition' --output text)"
case "$running_task_definition" in
  arn:aws:ecs:*) ;;
  *)
    echo "::error::service $service reports no task definition ($running_task_definition)" >&2
    exit 1
    ;;
esac
running_image="$(aws ecs describe-task-definition --task-definition "$running_task_definition" \
  --query "taskDefinition.containerDefinitions[?name=='$container'].image | [0]" --output text)"

if [[ "$running_image" == "$repository_uri@"* && "${running_image#*@}" =~ $digest_pattern ]]; then
  digest="${running_image#*@}"
  target=""
  echo "$running_task_definition already pins $running_image" >&2
else
  # Only tasks of the running revision count: a deployment still draining an
  # older revision must not pick the digest.
  task_arns="$(aws ecs list-tasks --cluster "$cluster" --service-name "$service" \
    --desired-status RUNNING --query 'taskArns' --output text)"
  if [[ -z "$task_arns" || "$task_arns" == "None" ]]; then
    echo "::error::$running_task_definition names $running_image, a tag, and $service has no running task to read its digest from" >&2
    exit 1
  fi
  # shellcheck disable=SC2086 # task ARNs are space-separated words
  digests="$(aws ecs describe-tasks --cluster "$cluster" --tasks $task_arns --output json |
    jq -r --arg td "$running_task_definition" --arg name "$container" \
      '[.tasks[] | select(.taskDefinitionArn == $td) | .containers[] | select(.name == $name) | .imageDigest // empty] | unique | .[]')"
  if [[ "$(wc -w <<<"$digests")" != "1" || ! "$digests" =~ $digest_pattern ]]; then
    echo "::error::$service's tasks of $running_task_definition do not run exactly one image digest: '${digests//$'\n'/ }'" >&2
    exit 1
  fi
  digest="$digests"
  target="pending"
  echo "$running_task_definition names $running_image; its tasks run $digest" >&2
fi

tags="$(aws ecr describe-images --repository-name "$repository" --image-ids "imageDigest=$digest" \
  --query 'imageDetails[0].imageTags' --output json)" || {
  echo "::error::$repository@$digest, the image $service runs, is no longer in ECR; a rollback could not pull it" >&2
  exit 1
}
commit="$(jq -r '[.[]? | select(test("^[0-9a-f]{40}$"))] | first // empty' <<<"$tags")"
rollback_tag="deployed-${commit:-${digest#sha256:}}"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "would tag $repository@$digest as $rollback_tag" >&2
  if [[ -z "$target" ]]; then
    echo "$running_task_definition"
  else
    DRY_RUN=1 bash "$script_dir/register-task-revision.sh" \
      "$running_task_definition" "$container" "$repository_uri@$digest"
  fi
  exit 0
fi

bash "$script_dir/tag-ecr-image.sh" "$repository" "$digest" "$rollback_tag" >&2
if [[ -z "$target" ]]; then
  target="$running_task_definition"
else
  target="$(bash "$script_dir/register-task-revision.sh" \
    "$running_task_definition" "$container" "$repository_uri@$digest")"
  echo "registered $target pinned to $repository_uri@$digest" >&2
fi
echo "$target"
